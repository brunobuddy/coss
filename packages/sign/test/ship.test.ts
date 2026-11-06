import { describe, expect, test } from "bun:test";
import { BillingError, createUsageGate } from "@coss/billing";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { and, eq } from "drizzle-orm";
import {
  authenticateSignSession,
  cancelSignRequest,
  consentToSign,
  createSignService,
  createSignSession,
  deleteSignDocument,
  deleteSignRequest,
  discardUnstoredDocuments,
  FakeDocumentStore,
  getSignRequest,
  LocalSealer,
  openSigning,
  prepareDocument,
  purgeExpiredSignSessions,
  readPdfSeal,
  readSignedDocument,
  runDueSignCleanup,
  runDueSignCompletions,
  S3DocumentStore,
  type SignEnvironment,
  SignError,
  type SignS3Api,
  sendSignRequest,
  signAsSigner,
} from "../src/index.ts";
import { signStoreFromEnv } from "../src/runtime.ts";
import { buildTestPdfBase64, TEST_SIGNATURE_PNG } from "../src/testing.ts";

const store = new FakeDocumentStore();
const service = createSignService({ store });

async function environment(mode: "live" | "sandbox") {
  const tenant = await createTestTenant();
  const env: SignEnvironment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: mode === "live" ? tenant.production.id : tenant.development.id,
    mode,
  };
  return { tenant, env };
}

/** A request signed by its one embedded signer, and its session. */
async function signed(env: SignEnvironment) {
  const { request } = await service.create({
    environment: env,
    apiKeyId: null,
    actor: { kind: "api_key" },
    params: {
      title: "NDA",
      documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
      signers: [
        {
          name: "Ada",
          email: "ada@example.com",
          delivery: "embedded",
          fields: [{ type: "signature", anchor: "{{signature:signer_1}}" }],
        },
      ],
    },
  });
  const session = await createSignSession({
    ...env,
    requestId: request.id,
    signerId: request.signers[0]?.id ?? "",
    signUrl: "https://sign.test",
    apiKeyId: null,
    expiresIn: 60,
  });
  const access = await authenticateSignSession({ id: session.id, token: session.token });
  if (!access) throw new Error("no session");
  const actor = { kind: "signer" as const };
  const view = await openSigning(access, { actor });
  await consentToSign(access, { disclosureSha256: view.disclosure.sha256, actor });
  await signAsSigner(access, { values: {}, signature: TEST_SIGNATURE_PNG, actor, store });
  return request;
}

describe("billing", () => {
  test("a live completion is metered once; sandbox never", async () => {
    const { tenant, env } = await environment("live");
    await signed(env);
    const scope = { organizationIds: [tenant.organization.id] };
    const sealer = await LocalSealer.create();
    await runDueSignCompletions({ limit: 5, scope }, { store, sealer });
    await runDueSignCompletions({ limit: 5, scope }, { store, sealer });
    const usage = await db
      .select({ quantity: schema.billingUsage.quantity })
      .from(schema.billingUsage)
      .where(
        and(
          eq(schema.billingUsage.organizationId, tenant.organization.id),
          eq(schema.billingUsage.meter, "sign.completed_requests"),
        ),
      );
    expect(usage.reduce((total, row) => total + row.quantity, 0)).toBe(1);

    const sandbox = await environment("sandbox");
    await signed(sandbox.env);
    await runDueSignCompletions(
      { limit: 5, scope: { organizationIds: [sandbox.tenant.organization.id] } },
      { store, sealer },
    );
    const none = await db
      .select()
      .from(schema.billingUsage)
      .where(eq(schema.billingUsage.organizationId, sandbox.tenant.organization.id));
    expect(none).toHaveLength(0);
  });
});

describe("Free's cap", () => {
  const capped = createSignService({ store, billing: createUsageGate() });
  const create = async (env: SignEnvironment, send = true) =>
    (
      await capped.create({
        environment: env,
        apiKeyId: null,
        actor: { kind: "api_key" },
        params: {
          title: "NDA",
          send,
          documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
          signers: [
            {
              name: "Ada",
              email: "ada@example.com",
              fields: [{ type: "signature", anchor: "{{signature:signer_1}}" }],
            },
          ],
        },
      })
    ).request;
  const actor = { kind: "api_key" as const };

  test("live requests count when sent, up to 5 a month; a canceled one gives its place back", async () => {
    const { env } = await environment("live");
    const sent = [];
    for (let index = 0; index < 5; index++) sent.push(await create(env));
    const refused = create(env);
    await expect(refused).rejects.toBeInstanceOf(BillingError);
    await expect(refused).rejects.toMatchObject({ code: "usage_limit_exceeded" });

    // Drafts don't count until they are sent.
    const draft = await create(env, false);
    await expect(capped.send({ ...env, requestId: draft.id, actor })).rejects.toBeInstanceOf(
      BillingError,
    );
    expect((await getSignRequest({ ...env, requestId: draft.id })).status).toBe("draft");

    // Canceling a draft frees nothing; canceling a sent request does.
    await capped.cancel({ ...env, requestId: draft.id, actor });
    await expect(create(env)).rejects.toBeInstanceOf(BillingError);
    await capped.cancel({ ...env, requestId: sent[0]?.id ?? "", actor });
    // A retried cancel gives nothing more back.
    await capped.cancel({ ...env, requestId: sent[0]?.id ?? "", actor });
    await create(env);
    await expect(create(env)).rejects.toBeInstanceOf(BillingError);
  });

  test("sandbox requests never count", async () => {
    const { env } = await environment("sandbox");
    for (let index = 0; index < 6; index++) await create(env);
    const draft = await create(env, false);
    await capped.send({ ...env, requestId: draft.id, actor });
  });

  test("without a gate, sending is uncapped", async () => {
    const { env } = await environment("live");
    const draft = await create(env, false);
    expect((await sendSignRequest({ ...env, requestId: draft.id, actor })).status).toBe("sent");
  });
});

describe("sandbox seals", () => {
  test("are made with the sandbox sealer, live ones with the real one", async () => {
    const live = await environment("live");
    const sandbox = await environment("sandbox");
    const liveRequest = await signed(live.env);
    const sandboxRequest = await signed(sandbox.env);
    const sealer = await LocalSealer.create("real seal");
    const sandboxSealer = await LocalSealer.create("test seal");
    await runDueSignCompletions(
      {
        limit: 5,
        scope: { organizationIds: [live.tenant.organization.id, sandbox.tenant.organization.id] },
      },
      { store, sealer, sandboxSealer },
    );
    const certificateOf = async (env: SignEnvironment, requestId: string) => {
      const { content } = await readSignedDocument({ ...env, requestId, store });
      return Buffer.from(readPdfSeal(content).cms).toString("latin1");
    };
    const latin1 = (der: Uint8Array | undefined) => Buffer.from(der ?? []).toString("latin1");
    expect(await certificateOf(live.env, liveRequest.id)).toContain(
      latin1(sealer.certificateChain[0]),
    );
    const sandboxCms = await certificateOf(sandbox.env, sandboxRequest.id);
    expect(sandboxCms).toContain(latin1(sandboxSealer.certificateChain[0]));
    expect(sandboxCms).not.toContain(latin1(sealer.certificateChain[0]));
  });
});

describe("deleting requests", () => {
  test("only when not sent; takes the signatures and signed document with it", async () => {
    const { tenant, env } = await environment("sandbox");
    const request = await signed(env);
    await runDueSignCompletions(
      { limit: 5, scope: { organizationIds: [tenant.organization.id] } },
      { store, sealer: await LocalSealer.create() },
    );
    const [signer] = await db
      .select({ key: schema.signSigner.signatureKey })
      .from(schema.signSigner)
      .where(eq(schema.signSigner.requestId, request.id));
    const [row] = await db
      .select({ key: schema.signRequest.signedDocumentKey })
      .from(schema.signRequest)
      .where(eq(schema.signRequest.id, request.id));
    expect(await store.get(signer?.key ?? "")).not.toBeNull();
    await deleteSignRequest(store, { ...env, requestId: request.id });
    expect(await store.get(signer?.key ?? "")).toBeNull();
    expect(await store.get(row?.key ?? "")).toBeNull();
    await expect(getSignRequest({ ...env, requestId: request.id })).rejects.toThrow(SignError);

    const { request: open } = await service.create({
      environment: env,
      apiKeyId: null,
      actor: { kind: "api_key" },
      params: {
        title: "Open",
        documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
        signers: [
          {
            name: "Ada",
            email: "ada@example.com",
            fields: [{ type: "signature", anchor: "{{signature:signer_1}}" }],
          },
        ],
      },
    });
    await expect(deleteSignRequest(store, { ...env, requestId: open.id })).rejects.toThrow(
      "cancel the request first",
    );
    await cancelSignRequest({ ...env, requestId: open.id, actor: { kind: "api_key" } });
    await deleteSignRequest(store, { ...env, requestId: open.id });
  });
});

describe("retention", () => {
  test("sessions go a week after they expire", async () => {
    const { tenant, env } = await environment("sandbox");
    await signed(env);
    const scope = { organizationIds: [tenant.organization.id] };
    expect(await purgeExpiredSignSessions({ scope })).toBe(0);
    const later = new Date(Date.now() + 8 * 86_400_000);
    expect(await purgeExpiredSignSessions({ now: later, scope })).toBe(1);
  });
});

describe("S3 store", () => {
  test("puts, gets and deletes an organization's prefix page by page", async () => {
    const objects = new Map<string, Uint8Array>();
    const api: SignS3Api = {
      async get(key) {
        return objects.get(key) ?? null;
      },
      async put(key, content) {
        objects.set(key, content);
      },
      async deleteKeys(keys) {
        for (const key of keys) objects.delete(key);
      },
      async list(prefix, token) {
        // Like S3: the token resumes after the last key returned.
        const keys = [...objects.keys()]
          .filter((key) => key.startsWith(prefix) && (!token || key > token))
          .sort();
        const page = keys.slice(0, 2);
        return { keys: page, next: keys.length > 2 ? (page.at(-1) ?? null) : null };
      },
    };
    const s3 = new S3DocumentStore(api);
    for (const index of [1, 2, 3, 4, 5]) {
      await s3.put({
        key: `orgs/org_a/env/documents/${index}.pdf`,
        organizationId: "org_a",
        contentType: "application/pdf",
        content: new Uint8Array([index]),
      });
    }
    await s3.put({
      key: "orgs/org_b/x.pdf",
      organizationId: "org_b",
      contentType: "application/pdf",
      content: new Uint8Array([9]),
    });
    expect(await s3.get("orgs/org_a/env/documents/3.pdf")).toEqual(new Uint8Array([3]));
    await s3.deleteOrganization("org_a");
    expect([...objects.keys()]).toEqual(["orgs/org_b/x.pdf"]);
  });

  test("the store from the environment", () => {
    expect(signStoreFromEnv({})).toBeInstanceOf(FakeDocumentStore);
    expect(
      signStoreFromEnv({ SIGN_DOCUMENTS_BUCKET: "bucket", AWS_REGION: "us-east-2" }),
    ).toBeInstanceOf(S3DocumentStore);
    expect(() => signStoreFromEnv({ SIGN_DOCUMENTS_BUCKET: "bucket" })).toThrow("AWS_REGION");
  });
});

describe("deletion cleanup", () => {
  // The cleanup loop runs rows due by `now`, which defaults to the app's clock (milliseconds), while
  // Postgres stamps a row due at once in microseconds: one scheduled in the same millisecond as the
  // run wouldn't be due yet.
  const later = () => new Date(Date.now() + 1_000);

  test("store objects a failed deletion left behind are deleted by the retry", async () => {
    const { tenant, env } = await environment("sandbox");
    const request = await signed(env);
    await runDueSignCompletions(
      { limit: 5, scope: { organizationIds: [tenant.organization.id] } },
      { store, sealer: await LocalSealer.create() },
    );
    const broken = Object.assign(Object.create(store), {
      delete: async () => {
        throw new Error("S3 is down");
      },
    }) as FakeDocumentStore;
    await deleteSignRequest(broken, { ...env, requestId: request.id });
    const pending = await db
      .select()
      .from(schema.signStoreCleanup)
      .where(eq(schema.signStoreCleanup.organizationId, tenant.organization.id));
    expect(pending.length).toBe(2);
    for (const row of pending) expect(await store.get(row.key)).not.toBeNull();
    const scope = { organizationIds: [tenant.organization.id] };
    expect(await runDueSignCleanup({ limit: 10, now: later(), scope }, store)).toBe(2);
    for (const row of pending) expect(await store.get(row.key)).toBeNull();
    expect(
      await db
        .select()
        .from(schema.signStoreCleanup)
        .where(eq(schema.signStoreCleanup.organizationId, tenant.organization.id)),
    ).toEqual([]);
  });

  test("a document deleted while the store is down is deleted by the retry", async () => {
    const { tenant, env } = await environment("sandbox");
    const document = await service.uploadDocument({
      environment: env,
      apiKeyId: null,
      filename: "nda.pdf",
      content: await buildTestPdfBase64(),
    });
    const broken = Object.assign(Object.create(store), {
      delete: async () => {
        throw new Error("S3 is down");
      },
    }) as FakeDocumentStore;
    await deleteSignDocument(broken, { ...env, documentId: document.id });
    const pending = await db
      .select()
      .from(schema.signStoreCleanup)
      .where(eq(schema.signStoreCleanup.organizationId, tenant.organization.id));
    expect(pending.length).toBe(1);
    const key = pending[0]?.key ?? "";
    expect(await store.get(key)).not.toBeNull();
    const scope = { organizationIds: [tenant.organization.id] };
    expect(await runDueSignCleanup({ limit: 10, now: later(), scope }, store)).toBe(1);
    expect(await store.get(key)).toBeNull();
  });

  test("a request deleted while it is being sealed leaves no signed PDF behind", async () => {
    const { tenant, env } = await environment("sandbox");
    const request = await signed(env);
    const sealer = await LocalSealer.create();
    const deleting = {
      name: "deleting",
      certificateChain: sealer.certificateChain,
      sign: async (data: Uint8Array) => {
        await deleteSignRequest(store, { ...env, requestId: request.id });
        return sealer.sign(data);
      },
    };
    await runDueSignCompletions(
      { limit: 5, scope: { organizationIds: [tenant.organization.id] } },
      { store, sealer: deleting },
    );
    const objects = await db
      .select({ key: schema.signFakeObject.key })
      .from(schema.signFakeObject)
      .where(eq(schema.signFakeObject.organizationId, tenant.organization.id));
    expect(objects.filter((object) => object.key.includes("/requests/"))).toEqual([]);
  });

  test("a failed upload's bytes the store wouldn't delete are left to the cleanup loop", async () => {
    const { tenant, env } = await environment("sandbox");
    const prepared = await prepareDocument(store, env, {
      filename: "nda.pdf",
      content: await buildTestPdfBase64(),
      apiKeyId: null,
    });
    const stubborn = Object.assign(Object.create(store), {
      delete: async () => {
        throw new Error("S3 is down");
      },
    }) as FakeDocumentStore;
    // No row was written for it (a refused request, say).
    await discardUnstoredDocuments(stubborn, [prepared]);
    expect(await store.get(prepared.storeKey)).not.toBeNull();
    const scope = { organizationIds: [tenant.organization.id] };
    expect(await runDueSignCleanup({ limit: 10, now: later(), scope }, store)).toBe(1);
    expect(await store.get(prepared.storeKey)).toBeNull();
  });

  test("an unpublished seal the store wouldn't delete is left to the cleanup loop", async () => {
    const { tenant, env } = await environment("sandbox");
    const request = await signed(env);
    const sealer = await LocalSealer.create();
    // Deletes refused: the request's deletion and the seal's own cleanup both wait for the loop.
    const stubborn = Object.assign(Object.create(store), {
      delete: async () => {
        throw new Error("S3 is down");
      },
    }) as FakeDocumentStore;
    const deleting = {
      name: "deleting",
      certificateChain: sealer.certificateChain,
      sign: async (data: Uint8Array) => {
        await deleteSignRequest(stubborn, { ...env, requestId: request.id });
        return sealer.sign(data);
      },
    };
    const scope = { organizationIds: [tenant.organization.id] };
    await runDueSignCompletions({ limit: 5, scope }, { store: stubborn, sealer: deleting });
    const pending = await db
      .select({ key: schema.signStoreCleanup.key })
      .from(schema.signStoreCleanup)
      .where(eq(schema.signStoreCleanup.organizationId, tenant.organization.id));
    expect(pending.some((row) => row.key.includes("/requests/"))).toBe(true);
    await runDueSignCleanup({ limit: 10, now: later(), scope }, store);
    const objects = await db
      .select({ key: schema.signFakeObject.key })
      .from(schema.signFakeObject)
      .where(eq(schema.signFakeObject.organizationId, tenant.organization.id));
    expect(objects.filter((object) => object.key.includes("/requests/"))).toEqual([]);
  });
});
