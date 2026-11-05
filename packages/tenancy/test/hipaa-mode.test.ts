import { describe, expect, test } from "bun:test";
import { getHipaaMode, HIPAA_IDLE_TIMEOUT_MINUTES } from "@coss/compliance";
import { db, schema } from "@coss/db";
import { eq } from "drizzle-orm";
import {
  disableHipaaMode,
  enableHipaaMode,
  isMemberOfHipaaOrganization,
  listAdminAuditEvents,
} from "../src/admin.ts";
import { setOrganizationTwoFactorRequired, TenancyError, touchHipaaSession } from "../src/index.ts";
import { endIfStillIdle } from "../src/session-activity.ts";
import { createTestTenant, createTestUser } from "../src/testing.ts";

const { organization, session, hipaaSessionActivity } = schema;

async function actor() {
  const admin = await createTestUser();
  return { userId: admin.id, email: admin.email };
}

async function enable(organizationId: string) {
  await enableHipaaMode({
    organizationId,
    baaSignedAt: new Date("2026-10-30T00:00:00Z"),
    baaReference: "BAA-2026-014",
    reason: "Contract signed",
    actor: await actor(),
  });
}

async function createSession(userId: string, createdAt: Date) {
  const id = `sess_${crypto.randomUUID()}`;
  await db.insert(session).values({
    id,
    token: crypto.randomUUID(),
    userId,
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(createdAt.getTime() + 7 * 86_400_000),
  });
  return { id, createdAt };
}

const MINUTE = 60_000;

describe("turning HIPAA mode on and off", () => {
  test("turning it on stores the BAA, requires two-factor and is audited", async () => {
    const tenant = await createTestTenant();
    await enable(tenant.organization.id);

    const mode = await getHipaaMode(tenant.organization.id);
    expect(mode?.baaReference).toBe("BAA-2026-014");
    const [row] = await db
      .select({ requireTwoFactor: organization.requireTwoFactor })
      .from(organization)
      .where(eq(organization.id, tenant.organization.id));
    expect(row?.requireTwoFactor).toBe(true);
    const { events } = await listAdminAuditEvents({ organizationId: tenant.organization.id });
    expect(events.map((event) => event.action)).toContain("organization.enable_hipaa_mode");
  });

  test("it can't be turned on twice, or off when it isn't on", async () => {
    const tenant = await createTestTenant();
    await enable(tenant.organization.id);
    await expect(enable(tenant.organization.id)).rejects.toBeInstanceOf(TenancyError);
    await disableHipaaMode({
      organizationId: tenant.organization.id,
      reason: "BAA ended",
      actor: await actor(),
    });
    await expect(
      disableHipaaMode({
        organizationId: tenant.organization.id,
        reason: "Again",
        actor: await actor(),
      }),
    ).rejects.toBeInstanceOf(TenancyError);
  });

  test("the BAA's reference and date are required", async () => {
    const tenant = await createTestTenant();
    const input = {
      organizationId: tenant.organization.id,
      reason: "Contract signed",
      actor: await actor(),
    };
    await expect(
      enableHipaaMode({ ...input, baaSignedAt: new Date("2026-10-30"), baaReference: "  " }),
    ).rejects.toBeInstanceOf(TenancyError);
    await expect(
      enableHipaaMode({ ...input, baaSignedAt: new Date("not a date"), baaReference: "BAA-1" }),
    ).rejects.toBeInstanceOf(TenancyError);
    expect(await getHipaaMode(tenant.organization.id)).toBeNull();
  });

  test("two-factor can't be turned off while it's on, and stays on after", async () => {
    const tenant = await createTestTenant();
    await enable(tenant.organization.id);
    await expect(
      setOrganizationTwoFactorRequired({
        organizationId: tenant.organization.id,
        required: false,
      }),
    ).rejects.toBeInstanceOf(TenancyError);

    await disableHipaaMode({
      organizationId: tenant.organization.id,
      reason: "BAA ended",
      actor: await actor(),
    });
    const [row] = await db
      .select({ requireTwoFactor: organization.requireTwoFactor })
      .from(organization)
      .where(eq(organization.id, tenant.organization.id));
    expect(row?.requireTwoFactor).toBe(true);
    await setOrganizationTwoFactorRequired({
      organizationId: tenant.organization.id,
      required: false,
    });
  });

  test("staff can't act as a member of an organization in the mode", async () => {
    const tenant = await createTestTenant();
    expect(await isMemberOfHipaaOrganization(tenant.owner.id)).toBe(false);
    await enable(tenant.organization.id);
    expect(await isMemberOfHipaaOrganization(tenant.owner.id)).toBe(true);
  });
});

describe("touchHipaaSession", () => {
  const idle = HIPAA_IDLE_TIMEOUT_MINUTES * MINUTE;

  test("activity keeps a session alive and is written at most once a minute", async () => {
    const tenant = await createTestTenant();
    const start = new Date("2026-11-03T10:00:00Z");
    const current = await createSession(tenant.owner.id, start);

    expect(await touchHipaaSession(current, new Date(start.getTime() + MINUTE))).toBe("active");
    const read = async () => {
      const [row] = await db
        .select()
        .from(hipaaSessionActivity)
        .where(eq(hipaaSessionActivity.sessionId, current.id));
      return row?.lastActiveAt.getTime();
    };
    const first = await read();
    expect(await touchHipaaSession(current, new Date(start.getTime() + 90_000))).toBe("active");
    expect(await read()).toBe(first);
    expect(await touchHipaaSession(current, new Date(start.getTime() + 3 * MINUTE))).toBe("active");
    expect(await read()).toBe(start.getTime() + 3 * MINUTE);
  });

  test("past the timeout the session ends", async () => {
    const tenant = await createTestTenant();
    const start = new Date("2026-11-03T10:00:00Z");
    const current = await createSession(tenant.owner.id, start);
    await touchHipaaSession(current, new Date(start.getTime() + MINUTE));

    expect(await touchHipaaSession(current, new Date(start.getTime() + MINUTE + idle))).toBe(
      "idle",
    );
    const rows = await db.select().from(session).where(eq(session.id, current.id));
    expect(rows).toEqual([]);
  });

  test("a session with no activity here is measured from when it began", async () => {
    const tenant = await createTestTenant();
    const start = new Date("2026-11-03T10:00:00Z");
    const current = await createSession(tenant.owner.id, start);
    expect(await touchHipaaSession(current, new Date(start.getTime() + idle))).toBe("idle");
  });

  test("a late request doesn't end a session another request has just kept alive", async () => {
    const tenant = await createTestTenant();
    const start = new Date("2026-11-03T10:00:00Z");
    const current = await createSession(tenant.owner.id, start);
    const late = new Date(start.getTime() + 2 * idle);
    await db
      .insert(hipaaSessionActivity)
      .values({ sessionId: current.id, lastActiveAt: new Date(late.getTime() - MINUTE) });

    // This request read an old timestamp and decided it's idle; the delete sees the new one.
    expect(await endIfStillIdle(current.id, late)).toBe(false);

    const rows = await db.select().from(session).where(eq(session.id, current.id));
    expect(rows).toHaveLength(1);
    expect(await endIfStillIdle(current.id, new Date(late.getTime() + idle))).toBe(true);
  });

  test("activity recorded after another request ended the session means idle", async () => {
    const tenant = await createTestTenant();
    const start = new Date("2026-11-03T10:00:00Z");
    const current = await createSession(tenant.owner.id, start);
    await db.delete(session).where(eq(session.id, current.id));
    expect(await touchHipaaSession(current, new Date(start.getTime() + MINUTE))).toBe("idle");
  });

  test("Better Auth extending the session doesn't count as activity", async () => {
    const tenant = await createTestTenant();
    const start = new Date("2026-11-03T10:00:00Z");
    const current = await createSession(tenant.owner.id, start);
    await touchHipaaSession(current, new Date(start.getTime() + MINUTE));
    const overnight = new Date(start.getTime() + 12 * 60 * MINUTE);
    await db.update(session).set({ updatedAt: overnight }).where(eq(session.id, current.id));

    expect(await touchHipaaSession(current, overnight)).toBe("idle");
  });
});
