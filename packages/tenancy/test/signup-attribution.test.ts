import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { eq } from "drizzle-orm";
import { recordSignupAttribution, signupSourcesForAdmin } from "../src/signup-attribution.ts";
import { createTestUser } from "../src/testing.ts";

const touch = (userId: string, landingPath = "/compare/resend") => ({
  userId,
  landingPath,
  referrerHost: "www.google.com",
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  landedAt: new Date(),
});

describe("recordSignupAttribution", () => {
  test("keeps the first touch of an account, once", async () => {
    const { id } = await createTestUser();
    expect(await recordSignupAttribution(touch(id))).toBe(true);
    expect(await recordSignupAttribution(touch(id, "/pricing"))).toBe(false);
    const [row] = await db
      .select()
      .from(schema.signupAttribution)
      .where(eq(schema.signupAttribution.userId, id));
    expect(row?.landingPath).toBe("/compare/resend");
  });

  test("refuses accounts that aren't new", async () => {
    const { id } = await createTestUser();
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await recordSignupAttribution(touch(id), { now: later })).toBe(false);
  });

  test("goes when the account does", async () => {
    const { id } = await createTestUser();
    await recordSignupAttribution(touch(id));
    await db.delete(schema.user).where(eq(schema.user.id, id));
    const rows = await db
      .select()
      .from(schema.signupAttribution)
      .where(eq(schema.signupAttribution.userId, id));
    expect(rows).toHaveLength(0);
  });
});

describe("signupSourcesForAdmin", () => {
  test("counts accounts with and without a first touch", async () => {
    const since = new Date(Date.now() - 1000);
    const path = `/test-${uniqueSuffix()}`;
    const first = await createTestUser();
    const second = await createTestUser();
    await createTestUser();
    await recordSignupAttribution(touch(first.id, path));
    await recordSignupAttribution(touch(second.id, path));
    // The test database is shared: other suites may add rows, never remove these.
    const sources = await signupSourcesForAdmin({ since, limit: 1000 });
    expect(sources.accounts).toBeGreaterThanOrEqual(3);
    expect(sources.attributed).toBeGreaterThanOrEqual(2);
    expect(sources.byLanding.find((row) => row.value === path)?.count).toBe(2);
  });
});
