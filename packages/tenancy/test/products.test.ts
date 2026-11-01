import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import {
  createProject,
  listProductPreferences,
  productActivityByEnvironment,
  productDailyActivity,
  productFigures,
  setProductPreference,
} from "../src/index.ts";
import { createTestTenant } from "../src/testing.ts";

describe("productActivityByEnvironment", () => {
  test("lists the products with anything in each environment", async () => {
    const tenant = await createTestTenant();
    await db.insert(schema.hookApplication).values({
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.development.id,
      name: "Acme",
    });

    const activity = await productActivityByEnvironment(tenant.organization.id);
    expect(activity.get(tenant.development.id)).toEqual(["hooks"]);
    expect(activity.get(tenant.production.id)).toEqual([]);
  });

  test("counts the organization's domains for Email in every environment", async () => {
    const tenant = await createTestTenant();
    const other = await createProject({ organizationId: tenant.organization.id, name: "Other" });
    await db.insert(schema.domain).values({
      organizationId: tenant.organization.id,
      name: `${tenant.organization.slug}.example.com`,
      provider: "fake",
      mailFromDomain: `mail.${tenant.organization.slug}.example.com`,
    });

    const activity = await productActivityByEnvironment(tenant.organization.id);
    expect(activity.size).toBe(4);
    for (const env of [tenant.production, tenant.development, ...other.environments]) {
      expect(activity.get(env.id)).toEqual(["email"]);
    }
  });
});

describe("product preferences", () => {
  test("pins, hides and resets a member's products", async () => {
    const tenant = await createTestTenant();
    const member = { organizationId: tenant.organization.id, userId: tenant.owner.id };

    await setProductPreference({ ...member, product: "sign", pinned: true });
    await setProductPreference({ ...member, product: "email", pinned: false });
    await setProductPreference({ ...member, product: "email", pinned: false });
    expect(await listProductPreferences(member)).toEqual({ sign: true, email: false });

    await setProductPreference({ ...member, product: "sign", pinned: null });
    expect(await listProductPreferences(member)).toEqual({ email: false });
  });
});

describe("productFigures", () => {
  test("counts each product's things in one environment", async () => {
    const tenant = await createTestTenant();
    for (const name of ["One", "Two"]) {
      await db.insert(schema.hookApplication).values({
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.development.id,
        name,
      });
    }
    const figures = await productFigures({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      since: new Date(Date.now() - 14 * 86_400_000),
    });
    expect(figures).toMatchObject({ hooks: 2, email: 0, forms: 0, risk: 0 });
  });
});

describe("productDailyActivity", () => {
  test("counts each product's rows per UTC day, oldest first", async () => {
    const tenant = await createTestTenant();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86_400_000);
    for (const createdAt of [now, now, yesterday]) {
      await db.insert(schema.contact).values({
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.development.id,
        address: `${crypto.randomUUID()}@example.com`,
        source: "api",
        createdAt,
      });
    }
    const daily = await productDailyActivity({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      days: 3,
      now,
    });
    expect(daily.marketing).toEqual([0, 1, 2]);
    expect(daily.email).toEqual([0, 0, 0]);
  });
});
