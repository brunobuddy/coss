import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { eq } from "drizzle-orm";
import type { LogoHttp } from "../src/logo-fetch.ts";
import {
  getOrganizationLogo,
  getOrganizationLogoState,
  hideOrganizationLogo,
  LOGO_RETRY_MS,
  logoDomainCandidates,
  organizationLogoVersions,
  refreshOrganizationLogo,
  runDueOrganizationLogos,
} from "../src/logos.ts";
import { createTestTenant } from "../src/testing.ts";
import { png } from "./logo-images.ts";

async function addSendingDomain(organizationId: string, name: string) {
  await db.insert(schema.domain).values({
    organizationId,
    name,
    provider: "fake",
    mailFromDomain: `bounce.${name}`,
    status: "verified",
    canSend: true,
  });
}

/** A site at `domain` whose apple-touch-icon is a PNG of `size`. */
function siteWithIcon(domain: string, size = 180): LogoHttp & { calls: number } {
  const http: LogoHttp & { calls: number } = Object.assign(
    async (url: URL) => {
      http.calls++;
      if (url.href === `https://${domain}/`) {
        return {
          status: 200,
          url: url.href,
          contentType: "text/html",
          body: Buffer.from('<head><link rel="apple-touch-icon" href="/touch.png"></head>'),
        };
      }
      if (url.href === `https://${domain}/touch.png`) {
        return { status: 200, url: url.href, contentType: "image/png", body: png(size, size) };
      }
      return null;
    },
    { calls: 0 },
  );
  return http;
}

describe("logoDomainCandidates", () => {
  test("verified sending domains and their parents, then members' work domains", async () => {
    const tenant = await createTestTenant();
    const suffix = uniqueSuffix();
    await addSendingDomain(tenant.organization.id, `mail.acme-${suffix}.com`);
    await db
      .update(schema.user)
      .set({ email: `founder@northwind-${suffix}.io` })
      .where(eq(schema.user.id, tenant.owner.id));

    expect(await logoDomainCandidates(tenant.organization.id)).toEqual([
      `mail.acme-${suffix}.com`,
      `acme-${suffix}.com`,
      `northwind-${suffix}.io`,
    ]);
  });

  test("never a free mailbox provider, a public suffix or a reserved name", async () => {
    const tenant = await createTestTenant();
    await addSendingDomain(tenant.organization.id, `shop-${uniqueSuffix()}.co.uk`);
    await db
      .update(schema.user)
      .set({ email: `someone-${uniqueSuffix()}@gmail.com` })
      .where(eq(schema.user.id, tenant.owner.id));
    const candidates = await logoDomainCandidates(tenant.organization.id);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEndWith(".co.uk");
  });
});

describe("runDueOrganizationLogos", () => {
  test("finds, stores and serves a logo, then waits for the monthly refresh", async () => {
    const tenant = await createTestTenant();
    const site = `acme-${uniqueSuffix()}.com`;
    await addSendingDomain(tenant.organization.id, site);
    const scope = { organizationIds: [tenant.organization.id] };
    const now = new Date("2026-11-01T12:00:00Z");

    expect(await getOrganizationLogoState(tenant.organization.id)).toMatchObject({
      status: "pending",
    });
    const http = siteWithIcon(site);
    expect(await runDueOrganizationLogos({ limit: 10, now, scope }, { http })).toBe(1);

    const logo = await getOrganizationLogo(tenant.organization.id);
    expect(logo?.contentType).toBe("image/png");
    expect(logo?.image.equals(png(180, 180))).toBe(true);
    expect(await getOrganizationLogoState(tenant.organization.id)).toMatchObject({
      status: "found",
      domain: site,
      sourceUrl: `https://${site}/touch.png`,
    });
    const versions = await organizationLogoVersions([tenant.organization.id]);
    expect(versions.get(tenant.organization.id)).toBe(logo?.sha256.slice(0, 12));

    const later = new Date(now.getTime() + 7 * 86_400_000);
    expect(await runDueOrganizationLogos({ limit: 10, now: later, scope }, { http })).toBe(0);
  });

  test("keeps a logo when the site is briefly down, and retries later", async () => {
    const tenant = await createTestTenant();
    const site = `acme-${uniqueSuffix()}.com`;
    await addSendingDomain(tenant.organization.id, site);
    const scope = { organizationIds: [tenant.organization.id] };
    const now = new Date("2026-11-01T12:00:00Z");
    await runDueOrganizationLogos({ limit: 10, now, scope }, { http: siteWithIcon(site) });

    await refreshOrganizationLogo(tenant.organization.id, now);
    await runDueOrganizationLogos({ limit: 10, now, scope }, { http: async () => null });
    expect(await getOrganizationLogo(tenant.organization.id)).not.toBeNull();

    const [row] = await db
      .select({ next: schema.organizationLogo.nextCheckAt })
      .from(schema.organizationLogo)
      .where(eq(schema.organizationLogo.organizationId, tenant.organization.id));
    expect(row?.next?.getTime()).toBe(now.getTime() + LOGO_RETRY_MS);
  });

  test("an organization without a domain is checked again later, and a hidden logo never", async () => {
    const tenant = await createTestTenant();
    const scope = { organizationIds: [tenant.organization.id] };
    const now = new Date("2026-11-01T12:00:00Z");
    const http = siteWithIcon("unused.example.com");
    expect(await runDueOrganizationLogos({ limit: 10, now, scope }, { http })).toBe(1);
    expect(http.calls).toBe(0);
    expect(await getOrganizationLogoState(tenant.organization.id)).toMatchObject({
      status: "not_found",
    });

    await hideOrganizationLogo(tenant.organization.id);
    const muchLater = new Date(now.getTime() + 365 * 86_400_000);
    expect(await runDueOrganizationLogos({ limit: 10, now: muchLater, scope }, { http })).toBe(0);
    expect(await getOrganizationLogoState(tenant.organization.id)).toMatchObject({
      status: "hidden",
    });

    await refreshOrganizationLogo(tenant.organization.id, muchLater);
    expect(await runDueOrganizationLogos({ limit: 10, now: muchLater, scope }, { http })).toBe(1);
  });
});
