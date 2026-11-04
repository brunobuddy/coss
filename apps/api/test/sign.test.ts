import { describe, expect, test } from "bun:test";
import { memoryLogWriter } from "@coss/logs/testing";
import { clientIpResolver } from "@coss/ratelimit";
import {
  authenticateSignSession,
  consentToSign,
  createSignSession,
  FakeDocumentStore,
  LocalSealer,
  openSigning,
  runDueSignCompletions,
  signAsSigner,
} from "@coss/sign";
import { buildTestPdfBase64, TEST_SIGNATURE_PNG } from "@coss/sign/testing";
import { createEnvironmentApiKey } from "@coss/tenancy";
import { createTestTenant } from "@coss/tenancy/testing";
import { apiRequest, createTestApp, errorOf } from "./helpers.ts";

const signer = (fields: unknown[] = [{ type: "signature", anchor: "{{signature:signer_1}}" }]) => ({
  name: "Ada Lovelace",
  email: "ada@example.com",
  fields,
});

describe("Sign documents", () => {
  test("upload, list, read and delete", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const upload = await apiRequest(app, "POST", "/v1/sign/documents", {
      key: tenant.sandboxKey,
      body: { filename: "nda.pdf", content: await buildTestPdfBase64() },
    });
    expect(upload.status).toBe(201);
    const document = await upload.json();
    expect(document).toMatchObject({
      object: "sign_document",
      filename: "nda.pdf",
      page_count: 1,
      pages: [{ width: 612, height: 792 }],
      sandbox: true,
    });
    expect(document.anchors[0].text).toBe("{{signature:signer_1}}");

    const list = await apiRequest(app, "GET", "/v1/sign/documents?limit=10", {
      key: tenant.sandboxKey,
    });
    expect((await list.json()).data.map((item: { id: string }) => item.id)).toEqual([document.id]);
    const read = await apiRequest(app, "GET", `/v1/sign/documents/${document.id}`, {
      key: tenant.sandboxKey,
    });
    expect(await read.json()).toEqual(document);
    // Another environment's key can't see it.
    const other = await apiRequest(app, "GET", `/v1/sign/documents/${document.id}`, {
      key: tenant.liveKey,
    });
    expect(other.status).toBe(404);

    const removed = await apiRequest(app, "DELETE", `/v1/sign/documents/${document.id}`, {
      key: tenant.sandboxKey,
    });
    expect(await removed.json()).toEqual({
      object: "sign_document",
      id: document.id,
      deleted: true,
    });
  });

  test("refuses files that aren't usable PDFs", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const notPdf = await apiRequest(app, "POST", "/v1/sign/documents", {
      key: tenant.sandboxKey,
      body: { filename: "nda.pdf", content: Buffer.from("hello world").toString("base64") },
    });
    expect(notPdf.status).toBe(422);
    expect((await errorOf(notPdf)).code).toBe("invalid_document");
    const badName = await apiRequest(app, "POST", "/v1/sign/documents", {
      key: tenant.sandboxKey,
      body: { filename: "nda.docx", content: await buildTestPdfBase64() },
    });
    expect((await errorOf(badName)).code).toBe("validation_error");
  });

  test("uploads take more than the default 5 MB body limit", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    // 6 MB of base64 that isn't a PDF: past the body limit, refused for what it is.
    const response = await apiRequest(app, "POST", "/v1/sign/documents", {
      key: tenant.sandboxKey,
      body: { filename: "big.pdf", content: "A".repeat(6 * 1024 * 1024) },
    });
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("invalid_document");
  });

  test("answer 503 where Sign isn't available", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp({ signService: null });
    const response = await apiRequest(app, "POST", "/v1/sign/documents", {
      key: tenant.sandboxKey,
      body: { filename: "nda.pdf", content: await buildTestPdfBase64() },
    });
    expect(response.status).toBe(503);
    const error = await errorOf(response);
    expect(error.code).toBe("sign_unavailable");
    expect(error.message).toBe("Sign is temporarily unavailable.");
    expect(error.hint).toBe("Retry later.");
  });
});

describe("Signature requests", () => {
  test("created with an inline document, read, and its audit trail", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp({
      clientIp: clientIpResolver({ header: "x-forwarded-for" }),
    });
    const create = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: tenant.liveKey,
      headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "acme-backend/1.0" },
      body: {
        title: "Services agreement",
        documents: [{ filename: "msa.pdf", content: await buildTestPdfBase64() }],
        signers: [signer()],
        metadata: { deal: "D-1" },
      },
    });
    expect(create.status).toBe(201);
    const request = await create.json();
    expect(request).toMatchObject({
      object: "sign_request",
      status: "sent",
      title: "Services agreement",
      sandbox: false,
      metadata: { deal: "D-1" },
    });
    expect(request.signers[0]).toMatchObject({
      object: "sign_signer",
      delivery: "email",
      authentication: "email_link",
      status: "pending",
    });
    expect(request.fields[0]).toMatchObject({ type: "signature", page: 1, required: true });

    const read = await apiRequest(app, "GET", `/v1/sign/requests/${request.id}`, {
      key: tenant.liveKey,
    });
    expect(await read.json()).toEqual(request);

    const trail = await apiRequest(app, "GET", `/v1/sign/requests/${request.id}/audit_trail`, {
      key: tenant.liveKey,
    });
    const events = (await trail.json()).data;
    expect(events.map((event: { type: string }) => event.type)).toEqual(["created", "sent"]);
    expect(events[0]).toMatchObject({
      actor: "api_key",
      ip_address: "203.0.113.9",
      user_agent: "acme-backend/1.0",
    });
    expect(events[1].previous_hash).toBe(events[0].hash);
  });

  test("drafts, sending and canceling", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const upload = await apiRequest(app, "POST", "/v1/sign/documents", {
      key: tenant.sandboxKey,
      body: { filename: "nda.pdf", content: await buildTestPdfBase64() },
    });
    const document = await upload.json();
    const create = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: tenant.sandboxKey,
      body: {
        title: "NDA",
        documents: [{ document_id: document.id }],
        signers: [signer([{ type: "signature", page: 1, x: 72, y: 600, width: 160, height: 30 }])],
        send: false,
      },
    });
    const draft = await create.json();
    expect(draft.status).toBe("draft");

    const listed = await apiRequest(app, "GET", "/v1/sign/requests?status=draft", {
      key: tenant.sandboxKey,
    });
    expect((await listed.json()).data.map((item: { id: string }) => item.id)).toEqual([draft.id]);

    const inUse = await apiRequest(app, "DELETE", `/v1/sign/documents/${document.id}`, {
      key: tenant.sandboxKey,
    });
    expect(inUse.status).toBe(422);
    expect((await errorOf(inUse)).code).toBe("document_in_use");

    const sent = await apiRequest(app, "POST", `/v1/sign/requests/${draft.id}/send`, {
      key: tenant.sandboxKey,
    });
    expect((await sent.json()).status).toBe("sent");
    const canceled = await apiRequest(app, "POST", `/v1/sign/requests/${draft.id}/cancel`, {
      key: tenant.sandboxKey,
    });
    expect((await canceled.json()).status).toBe("canceled");
    const again = await apiRequest(app, "POST", `/v1/sign/requests/${draft.id}/send`, {
      key: tenant.sandboxKey,
    });
    expect(again.status).toBe(422);
    expect((await errorOf(again)).code).toBe("request_not_draft");
  });

  test("validation errors name the field at fault", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const content = await buildTestPdfBase64();
    const offPage = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: tenant.sandboxKey,
      body: {
        title: "NDA",
        documents: [{ filename: "nda.pdf", content }],
        signers: [signer([{ type: "signature", page: 1, x: 600, y: 10, width: 100, height: 20 }])],
      },
    });
    expect(offPage.status).toBe(422);
    expect(await errorOf(offPage)).toMatchObject({
      code: "invalid_fields",
      param: "signers[0].fields[0]",
    });
    const unknownDocument = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: tenant.sandboxKey,
      body: {
        title: "NDA",
        documents: [{ document_id: "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz" }],
        signers: [signer()],
      },
    });
    expect(unknownDocument.status).toBe(422);
    expect(await errorOf(unknownDocument)).toMatchObject({
      code: "not_found",
      param: "documents[0].document_id",
    });
  });

  test("an Idempotency-Key replays the request", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const body = {
      title: "NDA",
      documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
      signers: [signer()],
    };
    const headers = { "Idempotency-Key": "nda-ada" };
    const first = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: tenant.sandboxKey,
      body,
      headers,
    });
    const second = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: tenant.sandboxKey,
      body,
      headers,
    });
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await second.json()).toEqual(await first.json());
  });

  test("keys need the sign permissions", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const reader = await createEnvironmentApiKey({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "Sign reader",
      userId: tenant.owner.id,
      permissions: { sign: ["read"] },
    });
    const refused = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: reader.key,
      body: {
        title: "NDA",
        documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
        signers: [signer()],
      },
    });
    expect(refused.status).toBe(403);
    const list = await apiRequest(app, "GET", "/v1/sign/requests", { key: reader.key });
    expect(list.status).toBe(200);
  });

  test("creating a request that is sent at once needs sign:send", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const creator = await createEnvironmentApiKey({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "Sign creator",
      userId: tenant.owner.id,
      permissions: { sign: ["create", "read"] },
    });
    const body = {
      title: "NDA",
      documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
      signers: [signer()],
    };
    const sent = await apiRequest(app, "POST", "/v1/sign/requests", { key: creator.key, body });
    expect(sent.status).toBe(403);
    expect((await errorOf(sent)).code).toBe("insufficient_permissions");
    const draft = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: creator.key,
      body: { ...body, send: false },
    });
    expect(draft.status).toBe(201);
    expect((await draft.json()).status).toBe("draft");
  });
});

describe("Signing sessions and settings", () => {
  async function sentRequest(key: string, app: ReturnType<typeof createTestApp>["app"]) {
    const create = await apiRequest(app, "POST", "/v1/sign/requests", {
      key,
      body: {
        title: "NDA",
        documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
        signers: [{ ...signer(), delivery: "embedded" }],
      },
    });
    return create.json();
  }

  test("a session links to the signing app with the token in the fragment", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp({ signUrl: "https://sign.example" });
    const request = await sentRequest(tenant.sandboxKey, app);
    const response = await apiRequest(
      app,
      "POST",
      `/v1/sign/requests/${request.id}/signers/${request.signers[0].id}/sessions`,
      { key: tenant.sandboxKey, body: {} },
    );
    expect(response.status).toBe(201);
    const session = await response.json();
    expect(session).toMatchObject({
      object: "sign_session",
      request_id: request.id,
      signer_id: request.signers[0].id,
    });
    expect(session.url).toBe(`https://sign.example/s/${session.id}#${session.token}`);

    // No body at all is fine too.
    const bare = await apiRequest(
      app,
      "POST",
      `/v1/sign/requests/${request.id}/signers/${request.signers[0].id}/sessions`,
      { key: tenant.sandboxKey },
    );
    expect(bare.status).toBe(201);

    const unknown = await apiRequest(
      app,
      "POST",
      `/v1/sign/requests/${request.id}/signers/ssgn_01k7c8m4q2f3e9v6t5r1n0p8yz/sessions`,
      { key: tenant.sandboxKey, body: {} },
    );
    expect(unknown.status).toBe(404);
  });

  test("request logs never keep a session's link or token", async () => {
    const tenant = await createTestTenant();
    const writer = memoryLogWriter();
    const { app } = createTestApp({ signUrl: "https://sign.example", logWriter: writer });
    const request = await sentRequest(tenant.sandboxKey, app);
    const response = await apiRequest(
      app,
      "POST",
      `/v1/sign/requests/${request.id}/signers/${request.signers[0].id}/sessions`,
      { key: tenant.sandboxKey, body: {} },
    );
    const session = await response.json();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(writer.entries.length).toBeGreaterThanOrEqual(2);
    const logged = JSON.stringify(writer.entries);
    expect(logged).not.toContain(session.token);
    expect(logged).not.toContain(session.id);
  });

  test("sessions answer 503 while the signing app isn't deployed", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp({ signUrl: null });
    const request = await sentRequest(tenant.sandboxKey, app);
    const response = await apiRequest(
      app,
      "POST",
      `/v1/sign/requests/${request.id}/signers/${request.signers[0].id}/sessions`,
      { key: tenant.sandboxKey, body: {} },
    );
    expect(response.status).toBe(503);
  });

  test("settings: read, update, and origins checked per environment mode", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const read = await apiRequest(app, "GET", "/v1/sign/settings", { key: tenant.liveKey });
    expect((await read.json()).allowed_origins).toEqual([]);
    const local = await apiRequest(app, "PATCH", "/v1/sign/settings", {
      key: tenant.liveKey,
      body: { allowed_origins: ["http://localhost:3000"] },
    });
    expect(local.status).toBe(422);
    expect((await errorOf(local)).code).toBe("invalid_origin");
    const updated = await apiRequest(app, "PATCH", "/v1/sign/settings", {
      key: tenant.liveKey,
      body: { allowed_origins: ["https://app.example.com"], accent_color: "#2563EB" },
    });
    expect(await updated.json()).toMatchObject({
      allowed_origins: ["https://app.example.com"],
      accent_color: "#2563eb",
    });
  });
});

describe("Signed documents", () => {
  test("downloadable once the completed request is sealed", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const create = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: tenant.sandboxKey,
      body: {
        title: "NDA",
        documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
        signers: [{ ...signer(), delivery: "embedded" }],
      },
    });
    const request = await create.json();
    const notReady = await apiRequest(
      app,
      "GET",
      `/v1/sign/requests/${request.id}/signed_document`,
      {
        key: tenant.sandboxKey,
      },
    );
    expect(notReady.status).toBe(422);
    expect((await errorOf(notReady)).code).toBe("signed_document_not_ready");

    // Sign through a session, then let the worker seal it.
    const store = new FakeDocumentStore();
    const session = await createSignSession({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      requestId: request.id,
      signerId: request.signers[0].id,
      signUrl: "https://sign.test",
      apiKeyId: null,
    });
    const access = await authenticateSignSession({ id: session.id, token: session.token });
    if (!access) throw new Error("no session");
    const view = await openSigning(access, { actor: { kind: "signer" } });
    await consentToSign(access, {
      disclosureSha256: view.disclosure.sha256,
      actor: { kind: "signer" },
    });
    await signAsSigner(access, {
      values: {},
      signature: TEST_SIGNATURE_PNG,
      actor: { kind: "signer" },
      store,
    });
    await runDueSignCompletions(
      { limit: 5, scope: { organizationIds: [tenant.organization.id] } },
      { store, sealer: await LocalSealer.create() },
    );

    const read = await apiRequest(app, "GET", `/v1/sign/requests/${request.id}`, {
      key: tenant.sandboxKey,
    });
    expect((await read.json()).signed_document.sha256).toMatch(/^[0-9a-f]{64}$/);
    const download = await apiRequest(
      app,
      "GET",
      `/v1/sign/requests/${request.id}/signed_document`,
      {
        key: tenant.sandboxKey,
      },
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect(
      Buffer.from(await download.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  });
});

describe("Reminders and the sender", () => {
  test("remind refuses when nobody can be reminded yet", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const create = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: tenant.sandboxKey,
      body: {
        title: "NDA",
        documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
        signers: [signer()],
        reminder_interval_days: 3,
      },
    });
    const request = await create.json();
    expect(request.reminder_interval_days).toBe(3);
    // Not invited yet (the worker sends invitations).
    const remind = await apiRequest(app, "POST", `/v1/sign/requests/${request.id}/remind`, {
      key: tenant.sandboxKey,
    });
    expect(remind.status).toBe(422);
    expect((await errorOf(remind)).code).toBe("reminder_not_due");
  });

  test("a live environment's email_from must be on a verified domain", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const live = await apiRequest(app, "PATCH", "/v1/sign/settings", {
      key: tenant.liveKey,
      body: { email_from: "contracts@unverified.example" },
    });
    expect(live.status).toBe(422);
    expect((await errorOf(live)).code).toBe("domain_not_verified");
    const sandbox = await apiRequest(app, "PATCH", "/v1/sign/settings", {
      key: tenant.sandboxKey,
      body: { email_from: "contracts@unverified.example", reminder_interval_days: 2 },
    });
    expect(await sandbox.json()).toMatchObject({
      email_from: "contracts@unverified.example",
      reminder_interval_days: 2,
    });
  });
});

describe("Deleting requests", () => {
  test("cancel first, then delete", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const create = await apiRequest(app, "POST", "/v1/sign/requests", {
      key: tenant.sandboxKey,
      body: {
        title: "NDA",
        documents: [{ filename: "nda.pdf", content: await buildTestPdfBase64() }],
        signers: [signer()],
      },
    });
    const request = await create.json();
    const refused = await apiRequest(app, "DELETE", `/v1/sign/requests/${request.id}`, {
      key: tenant.sandboxKey,
    });
    expect((await errorOf(refused)).code).toBe("request_not_deletable");
    await apiRequest(app, "POST", `/v1/sign/requests/${request.id}/cancel`, {
      key: tenant.sandboxKey,
    });
    const removed = await apiRequest(app, "DELETE", `/v1/sign/requests/${request.id}`, {
      key: tenant.sandboxKey,
    });
    expect(await removed.json()).toEqual({ object: "sign_request", id: request.id, deleted: true });
    const gone = await apiRequest(app, "GET", `/v1/sign/requests/${request.id}`, {
      key: tenant.sandboxKey,
    });
    expect(gone.status).toBe(404);
  });
});
