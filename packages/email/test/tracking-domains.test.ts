import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import {
  CloudFrontTrackingHostnameProvider,
  tenantName,
  tenantState,
} from "../src/cloudfront/tenants.ts";
import { createDomain, type DomainDeps, deleteDomain } from "../src/domains.ts";
import { DomainError } from "../src/errors.ts";
import { FakeEmailProvider } from "../src/providers/fake.ts";
import { FakeIdentityProvider } from "../src/providers/fake-identity.ts";
import { FakeTrackingHostnameProvider } from "../src/providers/fake-tracking-hostnames.ts";
import { emailRuntimeConfig } from "../src/runtime.ts";
import { DomainObject } from "../src/schemas.ts";
import { createEmailService } from "../src/service.ts";
import {
  createVerifiedDomain,
  FakeCloudFrontTenantsApi,
  fakeDnsResolver,
  memoryDispatchQueue,
  trackingUrls,
} from "../src/testing.ts";
import {
  checkTrackingDomain,
  createTrackingDomain,
  deleteTrackingDomain,
  domainObject,
  getTrackingDomain,
  recheckDueTrackingDomains,
  restartTrackingDomain,
  trackingBaseUrlFor,
  verifyTrackingDomain,
} from "../src/tracking-domains.ts";
import { TrackingHostnameTakenError } from "../src/tracking-hostnames.ts";
import { params, sendEnvironment } from "./helpers.ts";

const CNAME_TARGET = "track.coss.test";
const HOUR = 60 * 60 * 1000;

function fakeDeps(tracking = new FakeTrackingHostnameProvider({ cnameTarget: CNAME_TARGET })) {
  return { identity: new FakeIdentityProvider(), dns: null, tracking } satisfies DomainDeps;
}

function cloudFrontDeps(dns: DomainDeps["dns"] = null) {
  const api = new FakeCloudFrontTenantsApi();
  const tracking = new CloudFrontTrackingHostnameProvider(
    { distributionId: "dist", connectionGroupId: "group", cnameTarget: CNAME_TARGET },
    api,
  );
  return { api, deps: { identity: new FakeIdentityProvider(), dns, tracking } };
}

async function setup() {
  const tenant = await createTestTenant();
  const organizationId = tenant.organization.id;
  const domain = await createVerifiedDomain(organizationId);
  return { tenant, organizationId, domain };
}

async function expectDomainError(promise: Promise<unknown>, code: string): Promise<DomainError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code as DomainError["code"]);
  return error as DomainError;
}

describe("hostname rules", () => {
  test("must be a subdomain of the domain, outside its MAIL FROM subdomain", async () => {
    const { organizationId, domain } = await setup();
    const deps = fakeDeps();
    const create = (hostname: string) =>
      createTrackingDomain({ organizationId, domainId: domain.id, hostname }, deps);

    await expectDomainError(create(domain.name), "invalid_tracking_hostname");
    await expectDomainError(create("links.example.com"), "invalid_tracking_hostname");
    await expectDomainError(create(`links.x${domain.name}`), "invalid_tracking_hostname");
    await expectDomainError(create(`x.send.${domain.name}`), "invalid_tracking_hostname");
    await expectDomainError(create(`send.${domain.name}`), "invalid_tracking_hostname");
    await expectDomainError(create("https://links/x"), "invalid_tracking_hostname");

    const row = await create(` Links.${domain.name.toUpperCase()}. `);
    expect(row.hostname).toBe(`links.${domain.name}`);
  });

  test("can't sit under another organization's more specific domain", async () => {
    const { organizationId, domain } = await setup();
    const other = await createTestTenant();
    await createVerifiedDomain(other.organization.id, { name: `mail.${domain.name}` });
    const error = await expectDomainError(
      createTrackingDomain(
        { organizationId, domainId: domain.id, hostname: `links.mail.${domain.name}` },
        fakeDeps(),
      ),
      "invalid_tracking_hostname",
    );
    expect(error.message).toContain(`mail.${domain.name}`);
  });

  test("one per domain, and a hostname belongs to one domain at a time", async () => {
    const { organizationId, domain } = await setup();
    const deps = fakeDeps();
    await createTrackingDomain(
      { organizationId, domainId: domain.id, hostname: `links.${domain.name}` },
      deps,
    );
    await expectDomainError(
      createTrackingDomain(
        { organizationId, domainId: domain.id, hostname: `t.${domain.name}` },
        deps,
      ),
      "tracking_domain_exists",
    );
  });

  test("another organization's domain is not found", async () => {
    const { domain } = await setup();
    const other = await createTestTenant();
    await expectDomainError(
      createTrackingDomain(
        {
          organizationId: other.organization.id,
          domainId: domain.id,
          hostname: `links.${domain.name}`,
        },
        fakeDeps(),
      ),
      "not_found",
    );
  });
});

describe("lifecycle with the fake provider", () => {
  test("active at once, shown on the domain object", async () => {
    const { organizationId, domain } = await setup();
    const row = await createTrackingDomain(
      { organizationId, domainId: domain.id, hostname: `links.${domain.name}` },
      fakeDeps(),
    );
    expect(row.status).toBe("active");
    expect(row.activatedAt).not.toBeNull();
    const object = await domainObject(domain);
    expect(DomainObject.parse(object)).toEqual(object);
    expect(object.tracking).toMatchObject({
      hostname: `links.${domain.name}`,
      status: "active",
      record: {
        type: "CNAME",
        name: `links.${domain.name}`,
        value: CNAME_TARGET,
        status: "not_checked",
      },
      message: null,
    });
  });

  test("a domain without one has tracking null", async () => {
    const { domain } = await setup();
    expect((await domainObject(domain)).tracking).toBeNull();
  });

  test("a provider failure on create releases the claim", async () => {
    const { organizationId, domain } = await setup();
    const tracking = new FakeTrackingHostnameProvider();
    tracking.create = async (hostname) => {
      throw new TrackingHostnameTakenError(hostname);
    };
    await expectDomainError(
      createTrackingDomain(
        { organizationId, domainId: domain.id, hostname: `links.${domain.name}` },
        fakeDeps(tracking),
      ),
      "tracking_domain_taken",
    );
    tracking.create = async () => {
      throw new Error("boom");
    };
    await expectDomainError(
      createTrackingDomain(
        { organizationId, domainId: domain.id, hostname: `links.${domain.name}` },
        fakeDeps(tracking),
      ),
      "provider_error",
    );
    expect((await domainObject(domain)).tracking).toBeNull();
  });

  test("deleting it removes the hostname at the provider", async () => {
    const { organizationId, domain } = await setup();
    const tracking = new FakeTrackingHostnameProvider();
    const deps = fakeDeps(tracking);
    await createTrackingDomain(
      { organizationId, domainId: domain.id, hostname: `links.${domain.name}` },
      deps,
    );
    expect(tracking.hostnames).toEqual([`links.${domain.name}`]);
    await deleteTrackingDomain({ organizationId, domainId: domain.id }, deps);
    expect(tracking.hostnames).toEqual([]);
    expect((await domainObject(domain)).tracking).toBeNull();
    await expectDomainError(
      deleteTrackingDomain({ organizationId, domainId: domain.id }, deps),
      "not_found",
    );
  });

  test("deleting the domain removes its tracking hostname too", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    const tracking = new FakeTrackingHostnameProvider();
    const deps = fakeDeps(tracking);
    const domain = await createDomain(
      { organizationId, name: `t-${uniqueSuffix()}.coss.test`, userId: null },
      deps,
    );
    await createTrackingDomain(
      { organizationId, domainId: domain.id, hostname: `links.${domain.name}` },
      deps,
    );
    await deleteDomain({ organizationId, id: domain.id }, deps);
    expect(tracking.hostnames).toEqual([]);
    const rows = await db
      .select()
      .from(schema.trackingDomain)
      .where(eq(schema.trackingDomain.domainId, domain.id));
    expect(rows).toEqual([]);
  });
});

describe("lifecycle with CloudFront", () => {
  test("pending until CloudFront serves it; the CNAME check is reported", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const dns = fakeDnsResolver({ [`CNAME ${hostname}`]: ["other.example.net"] });
    const { api, deps } = cloudFrontDeps(dns);

    const row = await createTrackingDomain({ organizationId, domainId: domain.id, hostname }, deps);
    expect(row.status).toBe("pending");
    expect(row.record).toMatchObject({ status: "mismatch", found: ["other.example.net"] });
    expect(row.providerMessage).toContain(CNAME_TARGET);
    expect(api.calls[0]).toEqual({
      operation: "create",
      input: {
        distributionId: "dist",
        connectionGroupId: "group",
        name: tenantName(hostname),
        hostname,
      },
    });

    api.activate(hostname);
    const active = await checkTrackingDomain({ organizationId, domainId: domain.id }, deps);
    expect(active.status).toBe("active");
    expect(active.activatedAt).not.toBeNull();

    // The CNAME was removed: links fall back to the default host until it is back.
    api.set(hostname, { domainStatus: "inactive" });
    const moved = await checkTrackingDomain({ organizationId, domainId: domain.id }, deps);
    expect(moved.status).toBe("temporary_failure");
    expect(moved.providerMessage).toContain(CNAME_TARGET);

    api.activate(hostname);
    expect((await checkTrackingDomain({ organizationId, domainId: domain.id }, deps)).status).toBe(
      "active",
    );
  });

  test("an issued certificate is attached once, and it stays pending until the domain is active", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    const input = { organizationId, domainId: domain.id };
    await createTrackingDomain({ ...input, hostname }, deps);
    const attaches = () => api.calls.filter((call) => call.operation === "attachCertificate");

    expect((await checkTrackingDomain(input, deps)).status).toBe("pending");
    expect(attaches()).toHaveLength(0);

    api.issueCertificate(hostname);
    expect((await checkTrackingDomain(input, deps)).status).toBe("pending");
    expect(attaches()).toHaveLength(1);
    const tenant = api.find(hostname);
    expect(tenant?.attachedCertificateArn).not.toBeNull();
    expect(tenant?.attachedCertificateArn).toBe(tenant?.issuedCertificateArn ?? "");

    expect((await checkTrackingDomain(input, deps)).status).toBe("pending");
    expect(attaches()).toHaveLength(1);

    api.activate(hostname);
    expect((await checkTrackingDomain(input, deps)).status).toBe("active");
    expect(attaches()).toHaveLength(1);
  });

  test("an already active domain never has a certificate attached", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    const input = { organizationId, domainId: domain.id };
    await createTrackingDomain({ ...input, hostname }, deps);
    api.issueCertificate(hostname);
    api.set(hostname, { domainStatus: "active" });
    expect((await checkTrackingDomain(input, deps)).status).toBe("active");
    expect(api.calls.filter((call) => call.operation === "attachCertificate")).toHaveLength(0);
  });

  test("a stale ETag on attaching leaves it pending for the next check", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    const input = { organizationId, domainId: domain.id };
    await createTrackingDomain({ ...input, hostname }, deps);
    api.issueCertificate(hostname);

    const read = api.get.bind(api);
    api.get = async (id) => {
      const tenant = await read(id);
      return tenant && { ...tenant, etag: "stale" };
    };
    const stale = await checkTrackingDomain(input, deps);
    expect(stale.status).toBe("pending");
    expect(stale.providerHostnameId).not.toBeNull();
    expect(api.find(hostname)?.attachedCertificateArn).toBeNull();

    api.get = read;
    await checkTrackingDomain(input, deps);
    expect(api.find(hostname)?.attachedCertificateArn).not.toBeNull();
  });

  test("never activated within 72 hours: fails, releases the hostname, and can restart", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    const created = await createTrackingDomain(
      { organizationId, domainId: domain.id, hostname },
      deps,
    );

    const later = new Date(Date.now() + 73 * HOUR);
    const failed = await checkTrackingDomain(
      { organizationId, domainId: domain.id, now: later },
      deps,
    );
    expect(failed.status).toBe("failed");
    // Refused until the disable deploys, so the id stays for the retry.
    expect(failed.providerHostnameId).toBe(created.providerHostnameId);
    expect(failed.nextCheckAt).toEqual(new Date(later.getTime() + 10 * 60 * 1000));
    expect(api.find(hostname)?.enabled).toBe(false);

    api.deployDisable(hostname);
    const restarted = await restartTrackingDomain({ organizationId, domainId: domain.id }, deps);
    expect(restarted.status).toBe("pending");
    expect(restarted.providerHostnameId).not.toBe(created.providerHostnameId);
    expect(api.find(hostname)?.enabled).toBe(true);

    api.activate(hostname);
    expect(
      (await verifyTrackingDomain({ organizationId, domainId: domain.id }, deps))?.status,
    ).toBe("active");
  });

  test("a hostname CloudFront gave up on, or no longer knows, fails", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    await createTrackingDomain({ organizationId, domainId: domain.id, hostname }, deps);
    api.set(hostname, { certificateStatus: "validation-timed-out" });
    const failed = await checkTrackingDomain({ organizationId, domainId: domain.id }, deps);
    expect(failed.status).toBe("failed");
    expect(failed.providerMessage).toContain("could not be validated");

    api.deployDisable(hostname);
    await restartTrackingDomain({ organizationId, domainId: domain.id }, deps);
    api.tenants.clear();
    const gone = await checkTrackingDomain({ organizationId, domainId: domain.id }, deps);
    expect(gone.status).toBe("failed");
    expect(gone.providerHostnameId).toBeNull();
  });

  test("a hostname registered elsewhere at CloudFront is never adopted", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    const other = { distributionId: "other", connectionGroupId: "other" };
    await api.create({ ...other, name: "another-tenant", hostname });
    await expectDomainError(
      createTrackingDomain({ organizationId, domainId: domain.id, hostname }, deps),
      "tracking_domain_taken",
    );
    expect(api.tenants.size).toBe(1);
  });

  test("a tenant name already in use is never adopted", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    await api.create({
      distributionId: "other",
      connectionGroupId: "other",
      name: tenantName(hostname),
      hostname: "other.example.net",
    });
    await expectDomainError(
      createTrackingDomain({ organizationId, domainId: domain.id, hostname }, deps),
      "tracking_domain_taken",
    );
  });

  test("a CloudFront error on delete keeps the tracking domain", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    await createTrackingDomain({ organizationId, domainId: domain.id, hostname }, deps);
    api.failNext = "InternalError";
    await expectDomainError(
      deleteTrackingDomain({ organizationId, domainId: domain.id }, deps),
      "provider_error",
    );
    expect((await domainObject(domain)).tracking?.status).toBe("pending");
    expect(api.find(hostname)?.enabled).toBe(true);
  });

  test("a delete is refused until the disable deploys, then succeeds on retry", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    const input = { organizationId, domainId: domain.id };
    await createTrackingDomain({ ...input, hostname }, deps);
    api.activate(hostname);
    await checkTrackingDomain(input, deps);

    const error = await expectDomainError(deleteTrackingDomain(input, deps), "provider_error");
    expect(error.message).toContain("Try again shortly");
    expect((await domainObject(domain)).tracking?.status).toBe("active");
    expect(api.find(hostname)?.enabled).toBe(false);

    // Still deploying: refused again, without disabling twice.
    await expectDomainError(deleteTrackingDomain(input, deps), "provider_error");
    expect(api.calls.filter((call) => call.operation === "disable")).toHaveLength(1);

    api.deployDisable(hostname);
    await deleteTrackingDomain(input, deps);
    expect(api.find(hostname)).toBeUndefined();
    expect((await domainObject(domain)).tracking).toBeNull();
  });

  test("a disabled tenant stops counting as active at the next check", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    const input = { organizationId, domainId: domain.id };
    await createTrackingDomain({ ...input, hostname }, deps);
    api.activate(hostname);
    await checkTrackingDomain(input, deps);
    await expectDomainError(deleteTrackingDomain(input, deps), "provider_error");

    const checked = await checkTrackingDomain(input, deps);
    expect(checked.status).toBe("temporary_failure");
    expect(checked.providerMessage).toContain("being removed");
  });

  test("deleting the domain is refused until the disable deploys too", async () => {
    const tenant = await createTestTenant();
    const organizationId = tenant.organization.id;
    const { api, deps } = cloudFrontDeps();
    const domain = await createDomain(
      { organizationId, name: `t-${uniqueSuffix()}.coss.test`, userId: null },
      deps,
    );
    const hostname = `links.${domain.name}`;
    await createTrackingDomain({ organizationId, domainId: domain.id, hostname }, deps);

    await expectDomainError(
      deleteDomain({ organizationId, id: domain.id }, deps),
      "provider_error",
    );
    api.deployDisable(hostname);
    await deleteDomain({ organizationId, id: domain.id }, deps);
    expect(api.find(hostname)).toBeUndefined();
  });

  test("deleting a tenant CloudFront no longer knows succeeds", async () => {
    const { deps } = cloudFrontDeps();
    await deps.tracking.delete("dt-unknown");
  });

  test("the worker re-checks due tracking domains of its provider", async () => {
    const { organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const { api, deps } = cloudFrontDeps();
    await createTrackingDomain({ organizationId, domainId: domain.id, hostname }, deps);
    api.activate(hostname);
    const scope = { organizationIds: [organizationId] };

    expect(await recheckDueTrackingDomains({ scope }, deps)).toBe(0);
    const later = new Date(Date.now() + 2 * 60 * 1000);
    expect(await recheckDueTrackingDomains({ scope, now: later }, fakeDeps())).toBe(0);
    expect(await recheckDueTrackingDomains({ scope, now: later }, deps)).toBe(1);
    expect((await domainObject(domain)).tracking?.status).toBe("active");
    // Leased: a second worker at the same moment finds nothing due.
    expect(await recheckDueTrackingDomains({ scope, now: later }, deps)).toBe(0);
  });
});

describe("tenantState", () => {
  const state = (domain: string | null, certificate: string | null) =>
    tenantState(domain, certificate, CNAME_TARGET);

  test("active needs both the domain and its certificate", () => {
    expect(state("active", "issued")).toEqual({ status: "active", message: null });
    expect(state("inactive", "issued").status).toBe("pending");
    expect(state(null, "issued").status).toBe("pending");
    expect(state("active", "pending-validation").status).toBe("pending");
    expect(state("active", null).status).toBe("pending");
    expect(state("active", "inactive").status).toBe("pending");
  });

  test.each(["failed", "revoked", "expired", "validation-timed-out"])(
    "a %s certificate fails, whatever the domain says",
    (certificate) => {
      const result = state("active", certificate);
      expect(result.status).toBe("failed");
      expect(result.message).toContain("certificate");
    },
  );

  test("names the CNAME target while waiting for validation", () => {
    expect(state("inactive", "pending-validation").message).toContain(CNAME_TARGET);
    expect(state("inactive", "issued").message).toContain(CNAME_TARGET);
    expect(state(null, null).message).toBeNull();
  });
});

describe("emailRuntimeConfig", () => {
  const CLOUDFRONT = {
    EMAIL_PROVIDER: "fake",
    TRACKING_DOMAIN_PROVIDER: "cloudfront",
    TRACKING_DISTRIBUTION_ID: "dist",
    TRACKING_CONNECTION_GROUP_ID: "group",
    TRACKING_CNAME_TARGET: CNAME_TARGET,
  } as const;

  test("cloudfront needs both ids and the CNAME target", () => {
    expect(emailRuntimeConfig(CLOUDFRONT).tracking).toEqual({
      provider: "cloudfront",
      distributionId: "dist",
      connectionGroupId: "group",
      cnameTarget: CNAME_TARGET,
    });
    for (const missing of [
      "TRACKING_DISTRIBUTION_ID",
      "TRACKING_CONNECTION_GROUP_ID",
      "TRACKING_CNAME_TARGET",
    ]) {
      expect(() => emailRuntimeConfig({ ...CLOUDFRONT, [missing]: undefined })).toThrow(missing);
    }
  });

  test("the fake never points customers at the real tracking host", () => {
    expect(emailRuntimeConfig({ EMAIL_PROVIDER: "fake" }).tracking).toEqual({
      provider: "fake",
      cnameTarget: "track.coss.test",
    });
  });
});

describe("tenantName", () => {
  test("stable, valid and short whatever the hostname", () => {
    const long = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.example.com`;
    expect(tenantName(long)).toBe(tenantName(long));
    expect(tenantName(long)).toMatch(/^trk-[0-9a-f]{32}$/);
    expect(tenantName("links.acme.com")).not.toBe(tenantName("links.acme.org"));
  });
});

describe("sending through a tracking domain", () => {
  const HTML = '<html><body><a href="https://acme.com/one">1</a></body></html>';

  async function sendFrom(
    tenant: Awaited<ReturnType<typeof createTestTenant>>,
    from: string,
    trackingDomainProvider: string | null = "fake",
  ) {
    const provider = new FakeEmailProvider({ log: false });
    const queue = memoryDispatchQueue();
    const service = createEmailService({
      liveProvider: provider,
      sandboxProvider: provider,
      trackingBaseUrl: "https://api.coss.test",
      trackingDomainProvider: trackingDomainProvider ?? undefined,
      queue,
    });
    await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({ from, html: HTML, tracking: { opens: true, clicks: true } }),
    });
    await queue.drain(service);
    return trackingUrls(provider.sent.at(-1)?.html ?? "");
  }

  test("emails from the domain use its active tracking domain", async () => {
    const { tenant, organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    await createTrackingDomain({ organizationId, domainId: domain.id, hostname }, fakeDeps());

    const urls = await sendFrom(tenant, `hello@${domain.name}`);
    expect(urls.open).toStartWith(`https://${hostname}/t/o/`);
    expect(urls.clicks[0]).toStartWith(`https://${hostname}/t/c/`);
  });

  test("one-click unsubscribe headers use it too", async () => {
    const { tenant, organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    await createTrackingDomain({ organizationId, domainId: domain.id, hostname }, fakeDeps());
    const provider = new FakeEmailProvider({ log: false });
    const queue = memoryDispatchQueue();
    const service = createEmailService({
      liveProvider: provider,
      sandboxProvider: provider,
      trackingBaseUrl: "https://api.coss.test",
      trackingDomainProvider: "fake",
      queue,
    });
    await service.send({
      environment: sendEnvironment(tenant.production),
      apiKeyId: null,
      params: params({
        from: `hello@${domain.name}`,
        category: "news",
        tracking: { unsubscribe: true },
      }),
    });
    await queue.drain(service);
    expect(provider.sent.at(-1)?.headers["List-Unsubscribe"]).toStartWith(
      `<https://${hostname}/t/u/`,
    );
  });

  test("otherwise the default tracking host", async () => {
    const { tenant, organizationId, domain } = await setup();
    const hostname = `links.${domain.name}`;
    const tracking = new FakeTrackingHostnameProvider({
      state: () => ({ status: "pending", message: null }),
    });
    await createTrackingDomain(
      { organizationId, domainId: domain.id, hostname },
      fakeDeps(tracking),
    );
    // Not active yet.
    expect((await sendFrom(tenant, `hello@${domain.name}`)).open).toStartWith(
      "https://api.coss.test/t/o/",
    );

    const other = await setup();
    await createTrackingDomain(
      {
        organizationId: other.organizationId,
        domainId: other.domain.id,
        hostname: `links.${other.domain.name}`,
      },
      fakeDeps(),
    );
    // Another provider's tracking domain, or no provider configured.
    expect(
      (await sendFrom(other.tenant, `hi@${other.domain.name}`, "cloudfront")).open,
    ).toStartWith("https://api.coss.test/t/o/");
    expect((await sendFrom(other.tenant, `hi@${other.domain.name}`, null)).open).toStartWith(
      "https://api.coss.test/t/o/",
    );
  });

  test("a subdomain sender uses its most specific domain's tracking domain only", async () => {
    const { organizationId, domain } = await setup();
    await createTrackingDomain(
      { organizationId, domainId: domain.id, hostname: `links.${domain.name}` },
      fakeDeps(),
    );
    const base = (from: string, org = organizationId) =>
      trackingBaseUrlFor({ organizationId: org, from, provider: "fake" });
    expect(await base(`a@news.${domain.name}`)).toBe(`https://links.${domain.name}`);
    await createVerifiedDomain(organizationId, { name: `mail.${domain.name}` });
    expect(await base(`a@mail.${domain.name}`)).toBeNull();
    expect(await base(`a@${domain.name}`, (await createTestTenant()).organization.id)).toBeNull();
    expect(await base("not an address")).toBeNull();
  });
});

describe("tracking lifecycle recovery", () => {
  test.each(["expired", "failed"])(
    "retries cleanup after %s without losing the provider ID",
    async (reason) => {
      const { organizationId, domain } = await setup();
      const { api, deps } = cloudFrontDeps();
      const input = { organizationId, domainId: domain.id };
      const hostname = `links.${domain.name}`;
      const created = await createTrackingDomain({ ...input, hostname }, deps);
      if (reason === "failed") api.set(hostname, { certificateStatus: "failed" });
      const remove = deps.tracking.delete.bind(deps.tracking);
      let fail = true;
      deps.tracking.delete = async (id) => {
        if (fail) throw new Error("cleanup unavailable");
        await remove(id);
      };
      const now = new Date(Date.now() + 73 * HOUR);
      const failed = await checkTrackingDomain({ ...input, now }, deps);
      expect(failed.status).toBe("failed");
      expect(failed.providerHostnameId).toBe(created.providerHostnameId);
      expect(failed.nextCheckAt).not.toBeNull();
      const restarted = await restartTrackingDomain(input, deps);
      expect(restarted.status).toBe("failed");
      expect(restarted.providerHostnameId).toBe(created.providerHostnameId);
      expect(api.calls.filter((call) => call.operation === "create")).toHaveLength(1);
      const scope = { organizationIds: [organizationId] };
      expect(await recheckDueTrackingDomains({ scope, now }, deps)).toBe(1);
      expect((await getTrackingDomain(input))?.providerHostnameId).toBe(created.providerHostnameId);
      fail = false;
      // Disabling takes minutes to deploy: refused once more, with the id kept.
      expect(
        await recheckDueTrackingDomains({ scope, now: new Date(now.getTime() + HOUR) }, deps),
      ).toBe(1);
      expect((await getTrackingDomain(input))?.providerHostnameId).toBe(created.providerHostnameId);
      api.deployDisable(hostname);
      expect(
        await recheckDueTrackingDomains({ scope, now: new Date(now.getTime() + 2 * HOUR) }, deps),
      ).toBe(1);
      expect(await getTrackingDomain(input)).toMatchObject({
        status: "failed",
        providerHostnameId: null,
        nextCheckAt: null,
      });
      expect(api.find(hostname)).toBeUndefined();
      expect((await restartTrackingDomain(input, deps)).status).toBe("pending");
    },
  );

  test("verification during creation and restart waits for provisioning", async () => {
    const { organizationId, domain } = await setup();
    const deps = fakeDeps();
    const input = { organizationId, domainId: domain.id };
    const create = deps.tracking.create.bind(deps.tracking);
    for (const restarting of [false, true]) {
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      deps.tracking.create = async (hostname) => {
        entered.resolve();
        await release.promise;
        return create(hostname);
      };
      const provisioning = restarting
        ? restartTrackingDomain(input, deps)
        : createTrackingDomain({ ...input, hostname: `links.${domain.name}` }, deps);
      await entered.promise;
      try {
        expect(await verifyTrackingDomain(input, deps)).toMatchObject({
          status: "pending",
          providerHostnameId: null,
        });
      } finally {
        release.resolve();
      }
      const active = await provisioning;
      expect(active.status).toBe("active");
      expect(active.providerHostnameId).not.toBeNull();
      if (!active.providerHostnameId) throw new Error("Missing provisioned hostname ID");
      await deps.tracking.delete(active.providerHostnameId);
      await db
        .update(schema.trackingDomain)
        .set({
          status: "failed",
          providerHostnameId: null,
          nextCheckAt: null,
        })
        .where(eq(schema.trackingDomain.id, active.id));
    }
  });

  test("SES deletion failure leaves released tracking inactive and restartable", async () => {
    const { organizationId, domain } = await setup();
    const deps = fakeDeps();
    const input = { organizationId, domainId: domain.id };
    await createTrackingDomain({ ...input, hostname: `links.${domain.name}` }, deps);
    deps.identity.deleteDomainIdentity = async () => {
      throw new Error("SES unavailable");
    };
    await expectDomainError(
      deleteDomain({ organizationId, id: domain.id }, deps),
      "provider_error",
    );
    expect(await getTrackingDomain(input)).toMatchObject({
      status: "failed",
      providerHostnameId: null,
      nextCheckAt: null,
    });
    expect(
      await trackingBaseUrlFor({ organizationId, from: `hi@${domain.name}`, provider: "fake" }),
    ).toBeNull();
    expect((await restartTrackingDomain(input, deps)).status).toBe("active");
  });
});
