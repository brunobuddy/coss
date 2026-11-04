import { describe, expect, test } from "bun:test";
import { HipaaModeError } from "@coss/compliance";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import { db, schema } from "@coss/db";
import { enableHipaaMode } from "@coss/tenancy/admin";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import { getEmailForAdmin, listEmailsForAdmin } from "../src/admin.ts";
import { dedicatedPoolSql, reconcileDedicatedIpPools } from "../src/dedicated-ips.ts";
import { ensureOrgTenant } from "../src/domains.ts";
import { DEVELOPMENT_LINK_KEYS } from "../src/link-tokens.ts";
import { FakeEmailProvider } from "../src/providers/fake.ts";
import { FakeDedicatedIpProvider } from "../src/providers/fake-dedicated-ips.ts";
import { FakeIdentityProvider } from "../src/providers/fake-identity.ts";
import { getEmail } from "../src/read.ts";
import { createEmailService } from "../src/service.ts";
import { SesDedicatedIpProvider } from "../src/ses/dedicated-ips.ts";
import { SesIdentityProvider } from "../src/ses/identity.ts";
import { SesEmailProvider } from "../src/ses/provider.ts";
import { getStorageSettings, updateStorageSettings } from "../src/storage-settings.ts";
import { dispatchingEmailService, FakeSesApi, memoryDispatchQueue } from "../src/testing.ts";
import {
  resolveTracking,
  updateTrackingRule,
  upsertTrackingRule,
} from "../src/tracking-settings.ts";
import { params, sendEnvironment, verifiedFrom } from "./helpers.ts";

const { dedicatedIpPool } = schema;

function setup() {
  const provider = new FakeEmailProvider({ log: false });
  const sent: { requireTls?: boolean; html: string | null }[] = [];
  const recording = {
    name: provider.name,
    send: async (message: Parameters<FakeEmailProvider["send"]>[0]) => {
      sent.push({ requireTls: message.requireTls, html: message.html });
      return provider.send(message);
    },
  } as unknown as FakeEmailProvider;
  const service = dispatchingEmailService({
    liveProvider: recording,
    sandboxProvider: recording,
    trackingBaseUrl: "https://track.test",
  });
  return { service, sent };
}

async function tenantInMode() {
  const tenant = await createTestTenant();
  await enableTestHipaaMode(tenant.organization.id);
  return tenant;
}

function liveEnv(tenant: Awaited<ReturnType<typeof createTestTenant>>) {
  return { organizationId: tenant.organization.id, environmentId: tenant.production.id };
}

describe("HIPAA mode's content storage", () => {
  test("live environments always discard, and it can't be changed", async () => {
    const tenant = await tenantInMode();
    expect(await getStorageSettings(liveEnv(tenant))).toMatchObject({
      contentStorage: "discard",
      lockedByHipaaMode: true,
    });
    await expect(
      updateStorageSettings(liveEnv(tenant), { contentStorage: "store" }),
    ).rejects.toBeInstanceOf(HipaaModeError);
  });

  test("a sent email's content is gone, and it went out with TLS required", async () => {
    const tenant = await tenantInMode();
    const { service, sent } = setup();
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        subject: "Your results",
        html: "<p>Results</p>",
      }),
    });
    expect(sent.at(-1)?.requireTls).toBe(true);
    const stored = await getEmail({ ...liveEnv(tenant), id: email.id });
    expect(stored?.subject).toBe("");
    expect(stored?.html).toBeNull();
    expect(stored?.content_storage.mode).toBe("discard");
  });

  test("sandbox environments keep their content for testing", async () => {
    const tenant = await tenantInMode();
    const { service, sent } = setup();
    const { email } = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({ subject: "Test" }),
    });
    expect(sent.at(-1)?.requireTls).toBe(false);
    const stored = await getEmail({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      id: email.id,
    });
    expect(stored?.subject).toBe("Test");
  });

  test("turning the mode off brings the environment's own setting back", async () => {
    const tenant = await tenantInMode();
    await db
      .delete(schema.organizationHipaaMode)
      .where(eq(schema.organizationHipaaMode.organizationId, tenant.organization.id));
    expect(await getStorageSettings(liveEnv(tenant))).toMatchObject({
      contentStorage: "store",
      lockedByHipaaMode: false,
    });
  });
});

describe("HIPAA mode's tracking", () => {
  test("rules don't apply, but unsubscribe does", async () => {
    const tenant = await createTestTenant();
    await upsertTrackingRule(liveEnv(tenant), {
      category: null,
      opens: true,
      clicks: true,
      unsubscribe: true,
    });
    await enableTestHipaaMode(tenant.organization.id);
    expect(await resolveTracking(db, liveEnv(tenant), null, undefined)).toEqual({
      opens: false,
      clicks: false,
      unsubscribe: true,
    });
  });

  test("asking for it on a send or in a rule is refused", async () => {
    const tenant = await tenantInMode();
    const { service, sent } = setup();
    await expect(
      service.send({
        environment: sendEnvironment(tenant.production),
        apiKeyId: null,
        params: params({
          from: await verifiedFrom(tenant.organization.id),
          tracking: { clicks: true },
        }),
      }),
    ).rejects.toBeInstanceOf(HipaaModeError);
    expect(sent).toEqual([]);
    await expect(updateTrackingRule(liveEnv(tenant), null, { opens: true })).rejects.toBeInstanceOf(
      HipaaModeError,
    );
    expect(await updateTrackingRule(liveEnv(tenant), null, { unsubscribe: true })).not.toBeNull();
  });

  test("a live email has no pixel or rewritten link", async () => {
    const tenant = await tenantInMode();
    const { service, sent } = setup();
    await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        html: '<a href="https://clinic.example/result?id=1">Result</a>',
      }),
    });
    expect(sent.at(-1)?.html).toContain("https://clinic.example/result?id=1");
    expect(sent.at(-1)?.html).not.toContain("track.test");
  });
});

describe("turning HIPAA mode on", () => {
  test("applies to emails already waiting to go out", async () => {
    const tenant = await createTestTenant();
    const owner = { userId: tenant.owner.id, email: tenant.owner.email };
    const { service, sent } = setup();
    const accepted = createEmailService({
      linkKeys: DEVELOPMENT_LINK_KEYS,
      liveProvider: new FakeEmailProvider({ log: false }),
      sandboxProvider: new FakeEmailProvider({ log: false }),
      queue: memoryDispatchQueue(),
      trackingBaseUrl: "https://track.test",
    });
    const { email } = await accepted.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        subject: "Your results",
        html: '<a href="https://clinic.example/r">Result</a>',
        tracking: { opens: true, clicks: true },
      }),
    });

    await enableHipaaMode({
      organizationId: tenant.organization.id,
      baaSignedAt: new Date("2026-10-30T00:00:00Z"),
      baaReference: "BAA-1",
      reason: "Contract signed",
      actor: owner,
    });
    await service.dispatch({ organizationId: tenant.organization.id, emailId: email.id });

    expect(sent.at(-1)?.requireTls).toBe(true);
    expect(sent.at(-1)?.html).not.toContain("track.test");
    const stored = await getEmail({ ...liveEnv(tenant), id: email.id });
    expect(stored?.subject).toBe("");
  });
});

describe("an email that finishes without being claimed", () => {
  test("a scheduled email canceled after the mode turned on keeps no content", async () => {
    const tenant = await createTestTenant();
    const service = createEmailService({
      linkKeys: DEVELOPMENT_LINK_KEYS,
      liveProvider: new FakeEmailProvider({ log: false }),
      sandboxProvider: new FakeEmailProvider({ log: false }),
      queue: memoryDispatchQueue(),
    });
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        subject: "Your biopsy results",
        html: "<p>Results</p>",
        scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
    await enableTestHipaaMode(tenant.organization.id);

    await service.cancel({ ...liveEnv(tenant), emailId: email.id });

    const stored = await getEmail({ ...liveEnv(tenant), id: email.id });
    expect(stored?.status).toBe("canceled");
    expect(stored?.subject).toBe("");
    expect(stored?.html).toBeNull();
    expect(stored?.content_storage.mode).toBe("discard");
  });

  test("other organizations' canceled emails keep theirs", async () => {
    const tenant = await createTestTenant();
    const service = createEmailService({
      linkKeys: DEVELOPMENT_LINK_KEYS,
      liveProvider: new FakeEmailProvider({ log: false }),
      sandboxProvider: new FakeEmailProvider({ log: false }),
      queue: memoryDispatchQueue(),
    });
    const { email } = await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(tenant.organization.id),
        subject: "Welcome",
        scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });

    await service.cancel({ ...liveEnv(tenant), emailId: email.id });

    const stored = await getEmail({ ...liveEnv(tenant), id: email.id });
    expect(stored?.subject).toBe("Welcome");
  });
});

describe("mail coss.com sends for an organization in HIPAA mode", () => {
  test("stays off coss.com's own dedicated pool, which needn't require TLS", async () => {
    const coss = await createTestTenant();
    const organizationId = coss.organization.id;
    const scope = { organizationIds: [organizationId] };
    const dedicatedIps = new FakeDedicatedIpProvider();
    const identity = new FakeIdentityProvider();
    await ensureOrgTenant(organizationId, identity);
    const deps = { dedicatedIps, identity };
    await reconcileDedicatedIpPools({ entitled: [organizationId], scope }, deps);
    await reconcileDedicatedIpPools({ entitled: [organizationId], scope }, deps);
    const from = await verifiedFrom(organizationId);
    const sentMessages: { dedicatedPool?: boolean; requireTls?: boolean }[] = [];
    const inner = new FakeEmailProvider({ log: false });
    const recording = {
      name: inner.name,
      send: async (message: Parameters<FakeEmailProvider["send"]>[0]) => {
        sentMessages.push(message);
        return inner.send(message);
      },
    } as unknown as FakeEmailProvider;
    const service = dispatchingEmailService({
      liveProvider: recording,
      sandboxProvider: recording,
    });

    await service.send({
      environment: sendEnvironment(coss.production),
      apiKeyId: null,
      params: params({ from }),
    });
    await service.send({
      environment: sendEnvironment(coss.production),
      apiKeyId: null,
      params: params({ from, subject: "New submission" }),
      hipaaOrigin: true,
    });

    expect(sentMessages[0]?.dedicatedPool).toBe(true);
    expect(sentMessages[1]?.dedicatedPool).toBe(false);
    expect(sentMessages[1]?.requireTls).toBe(true);
  });

  async function sendAsCoss() {
    const coss = await createTestTenant();
    const { service, sent } = setup();
    const { email } = await service.send({
      environment: sendEnvironment(coss.production),
      apiKeyId: null,
      params: params({
        from: await verifiedFrom(coss.organization.id),
        subject: "New submission to Intake",
        html: "<p>Symptoms: chest pain</p>",
      }),
      discardBody: true,
      hipaaOrigin: true,
    });
    return { coss, sent, email };
  }

  test("requires TLS and keeps no content, though coss.com isn't in the mode", async () => {
    const { coss, sent, email } = await sendAsCoss();
    expect(sent.at(-1)?.requireTls).toBe(true);
    const stored = await getEmail({ ...liveEnv(coss), id: email.id });
    expect(stored?.subject).toBe("");
  });

  test("is hidden from staff and never screened", async () => {
    const { coss, email } = await sendAsCoss();
    expect((await getEmailForAdmin(email.id))?.hipaaMode).toBe(true);
    const { items } = await listEmailsForAdmin({
      organizationId: coss.organization.id,
      scope: { organizationIds: [coss.organization.id] },
    });
    expect(items[0]?.subject).toBe("Hidden (HIPAA mode)");
    const [row] = await db
      .select({ screeningExempt: schema.email.screeningExempt })
      .from(schema.email)
      .where(eq(schema.email.id, email.id));
    expect(row?.screeningExempt).toBe(true);
  });
});

describe("HIPAA mode in the admin console", () => {
  test("lists hide the subject and the detail says it's hidden", async () => {
    const tenant = await tenantInMode();
    const { service } = setup();
    const { email } = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({ subject: "Your results" }),
    });
    const { items } = await listEmailsForAdmin({
      organizationId: tenant.organization.id,
      scope: { organizationIds: [tenant.organization.id] },
    });
    expect(items[0]?.subject).toBe("Hidden (HIPAA mode)");
    expect((await getEmailForAdmin(email.id))?.hipaaMode).toBe(true);
  });

  test("other organizations' emails stay visible", async () => {
    const tenant = await createTestTenant();
    const { service } = setup();
    const { email } = await service.send({
      environment: sendEnvironment(tenant.development),
      apiKeyId: null,
      params: params({ subject: "Welcome" }),
    });
    const { items } = await listEmailsForAdmin({
      organizationId: tenant.organization.id,
      scope: { organizationIds: [tenant.organization.id] },
    });
    expect(items[0]?.subject).toBe("Welcome");
    expect((await getEmailForAdmin(email.id))?.hipaaMode).toBe(false);
  });
});

describe("HIPAA mode's required TLS", () => {
  const config = {
    region: "eu-west-1",
    configurationSets: { transactional: "coss-test", marketing: "coss-test-marketing" },
    tenantPrefix: "test",
  };

  test("SES sends through the stream's TLS set, or the normal one otherwise", async () => {
    const api = new FakeSesApi();
    const provider = new SesEmailProvider(api, config);
    const message = {
      emailId: "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
      organizationId: "org_01k7c8m4q2f3e9v6t5r1n0p8yz",
      stream: "transactional" as const,
      from: "a@example.com",
      to: ["b@example.com"],
      cc: [],
      bcc: [],
      replyTo: [],
      subject: "Hi",
      html: null,
      text: "Hi",
      headers: {},
      tags: [],
      attachments: [],
    };
    await provider.send({ ...message, requireTls: true });
    await provider.send(message);
    await provider.send({ ...message, stream: "marketing", requireTls: true });
    const sets = api.calls
      .filter((call) => call.operation === "sendEmail")
      .map((call) => (call.input as { ConfigurationSetName: string }).ConfigurationSetName);
    expect(sets).toEqual(["coss-test-tls", "coss-test", "coss-test-marketing-tls"]);
  });

  test("a new tenant is associated with its stream's TLS set", async () => {
    const api = new FakeSesApi();
    api.bootstrap("coss-test");
    api.bootstrap("coss-test-marketing");
    const identity = new SesIdentityProvider(api, config);
    await identity.ensureTenant({
      organizationId: "org_01k7c8m4q2f3e9v6t5r1n0p8yz",
      stream: "transactional",
    });
    const associated = api.calls
      .filter((call) => call.operation === "createTenantResourceAssociation")
      .map((call) => (call.input as { ResourceArn: string }).ResourceArn);
    expect(associated.some((arn) => arn.endsWith("configuration-set/coss-test"))).toBe(true);
    expect(associated.some((arn) => arn.endsWith("configuration-set/coss-test-tls"))).toBe(true);
  });

  test("a tenant still works when bootstrap hasn't made the TLS set yet", async () => {
    const api = new FakeSesApi();
    api.bootstrap("coss-test");
    api.bootstrap("coss-test-marketing");
    const associate = api.createTenantResourceAssociation.bind(api);
    api.createTenantResourceAssociation = async (input) => {
      if (input.ResourceArn?.endsWith("-tls")) {
        throw Object.assign(new Error("denied"), { name: "AccessDeniedException" });
      }
      return associate(input);
    };
    const identity = new SesIdentityProvider(api, config);
    const tenant = await identity.ensureTenant({
      organizationId: "org_01k7c8m4q2f3e9v6t5r1n0p8yz",
      stream: "transactional",
    });
    expect(tenant.tenantName).toBeTruthy();
  });

  test("a dedicated pool's delivery options keep the pool and set the policy", async () => {
    const api = new FakeSesApi();
    api.bootstrap("coss-test");
    api.bootstrap("coss-test-marketing");
    const identity = new SesIdentityProvider(api, config);
    const pools = new SesDedicatedIpProvider(api, config);
    const organizationId = "org_01k7c8m4q2f3e9v6t5r1n0p8yz";
    const tenant = await identity.ensureTenant({ organizationId, stream: "transactional" });
    await pools.ensurePool({ organizationId, tenants: { transactional: tenant } });
    await pools.setRequireTls({ organizationId, streams: ["transactional"], require: true });
    const put = api.calls.filter((call) => call.operation === "putConfigurationSetDeliveryOptions");
    expect(put.at(-1)?.input).toMatchObject({
      SendingPoolName: expect.stringContaining("test-"),
      TlsPolicy: "REQUIRE",
    });
  });

  test("mail stays off a dedicated pool until the pool requires TLS", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    const scope = { organizationIds: [organizationId] };
    const dedicatedIps = new FakeDedicatedIpProvider();
    const identity = new FakeIdentityProvider();
    await ensureOrgTenant(organizationId, identity);
    const deps = { dedicatedIps, identity };
    await reconcileDedicatedIpPools({ entitled: [organizationId], scope }, deps);
    await reconcileDedicatedIpPools({ entitled: [organizationId], scope }, deps);
    const inPool = async () => {
      const [row] = await db
        .select({ inPool: dedicatedPoolSql(organizationId, dedicatedIps.name, "transactional") })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      return row?.inPool;
    };
    expect(await inPool()).toBe(true);

    await enableTestHipaaMode(organizationId);
    expect(await inPool()).toBe(false);

    await reconcileDedicatedIpPools({ entitled: [organizationId], scope }, deps);
    expect(dedicatedIps.tlsRequired.has(organizationId)).toBe(true);
    expect(await inPool()).toBe(true);

    await db
      .delete(schema.organizationHipaaMode)
      .where(eq(schema.organizationHipaaMode.organizationId, organizationId));
    await reconcileDedicatedIpPools({ entitled: [organizationId], scope }, deps);
    expect(dedicatedIps.tlsRequired.has(organizationId)).toBe(false);
    const [pool] = await db
      .select({ tlsRequiredAt: dedicatedIpPool.tlsRequiredAt })
      .from(dedicatedIpPool)
      .where(eq(dedicatedIpPool.organizationId, organizationId));
    expect(pool?.tlsRequiredAt).toBeNull();
  });
});
