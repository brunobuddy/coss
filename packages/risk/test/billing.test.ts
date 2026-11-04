import { describe, expect, test } from "bun:test";
import { createUsageGate } from "@coss/billing";
import { db, schema } from "@coss/db";
import { fakeClassifier } from "@coss/screening/testing";
import { and, eq, sql } from "drizzle-orm";
import { assessRisk, type RiskDeps } from "../src/assess.ts";
import { addRiskListEntry } from "../src/lists.ts";
import { classifyContentForCustomer } from "../src/lookups.ts";
import { CreateRiskAssessmentRequest } from "../src/schemas.ts";
import { type Setup, setup } from "./helpers.ts";

const NOW = new Date();

function periodOf(at: Date) {
  return { start: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)) };
}

function gated(): Partial<RiskDeps> {
  return { usage: createUsageGate({ ttlMs: 0 }) };
}

type Input = Parameters<typeof CreateRiskAssessmentRequest.parse>[0];

function assessMetered(s: Setup, params: Input, idempotencyKey?: string) {
  return assessRisk(s.deps, {
    environment: s.live,
    params: CreateRiskAssessmentRequest.parse(params),
    idempotencyKey,
    metered: true,
  });
}

async function metered(organizationId: string, meter = "risk.assessments"): Promise<number> {
  const [row] = await db
    .select({ quantity: sql<number>`coalesce(sum(${schema.billingUsage.quantity}), 0)::int` })
    .from(schema.billingUsage)
    .where(
      and(
        eq(schema.billingUsage.organizationId, organizationId),
        eq(schema.billingUsage.meter, meter),
      ),
    );
  return row?.quantity ?? 0;
}

async function reserved(organizationId: string, at: Date, meter = "risk.assessments") {
  const [row] = await db
    .select({ reserved: schema.billingQuota.reserved })
    .from(schema.billingQuota)
    .where(
      and(
        eq(schema.billingQuota.organizationId, organizationId),
        eq(schema.billingQuota.meter, meter),
        eq(schema.billingQuota.periodStart, periodOf(at).start),
      ),
    );
  return row?.reserved ?? 0;
}

async function useUpAllowance(organizationId: string, at: Date, meter = "risk.assessments") {
  await db.insert(schema.billingQuota).values({
    organizationId,
    meter,
    periodStart: periodOf(at).start,
    reserved: 10_000,
  });
}

const signup = { event: "signup", user: { email: "ada@example.com" } } as const;

describe("what is billed", () => {
  test("an allowed assessment reserves and records one unit", async () => {
    const s = await setup(gated());
    const { assessment } = await assessMetered(s, signup);
    expect(assessment.decision).toBe("allow");
    expect(await metered(s.organizationId)).toBe(1);
    expect(await reserved(s.organizationId, NOW)).toBe(1);
  });

  test("a blocked assessment is free and gives its unit back", async () => {
    const s = await setup(gated());
    await addRiskListEntry(s.live, { list: "block", type: "email", value: "ada@example.com" });
    const { assessment } = await assessMetered(s, signup);
    expect(assessment.decision).toBe("block");
    expect(await metered(s.organizationId)).toBe(0);
    expect(await reserved(s.organizationId, NOW)).toBe(0);
  });

  test("a replay is free", async () => {
    const s = await setup(gated());
    const first = await assessMetered(s, signup, "key-1");
    const again = await assessMetered(s, signup, "key-1");
    expect(again.replayed).toBe(true);
    expect(again.assessment.id).toBe(first.assessment.id);
    expect(await metered(s.organizationId)).toBe(1);
    expect(await reserved(s.organizationId, NOW)).toBe(1);
  });

  test("a failed assessment gives its unit back", async () => {
    const s = await setup(gated());
    await assessMetered(s, signup, "key-2");
    await expect(
      assessMetered(s, { ...signup, user: { email: "other@example.com" } }, "key-2"),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    expect(await metered(s.organizationId)).toBe(1);
    expect(await reserved(s.organizationId, NOW)).toBe(1);
  });

  test("internal callers and sandbox environments are never billed or reduced", async () => {
    const s = await setup(gated());
    await useUpAllowance(s.organizationId, NOW);
    const internal = await s.assess(signup);
    expect(internal.assessment.degraded).not.toContain("usage_limit");
    const sandbox = await assessRisk(s.deps, {
      environment: s.sandbox,
      params: CreateRiskAssessmentRequest.parse(signup),
      metered: true,
    });
    expect(sandbox.assessment.degraded).not.toContain("usage_limit");
    expect(await metered(s.organizationId)).toBe(0);
  });

  test("unexpected billing trouble never fails or reduces an assessment", async () => {
    const s = await setup({
      usage: {
        reserve: () => Promise.reject(new Error("Billing is down.")),
      },
    });
    const { assessment } = await assessMetered(s, signup);
    expect(assessment.degraded).not.toContain("usage_limit");
    expect(await metered(s.organizationId)).toBe(1);
  });
});

describe("past the allowance", () => {
  test("assessments go on, free, without velocity, memory, content or paid data", async () => {
    let classified = 0;
    const classifier = fakeClassifier();
    const s = await setup({
      ...gated(),
      classifier: {
        ...classifier,
        classify: (content, signal) => {
          classified += 1;
          return classifier.classify(content, signal);
        },
      },
    });
    // A first account for the mailbox, while there is allowance.
    await assessMetered(s, { event: "signup", user: { id: "u_1", email: "ada@example.com" } });
    await db
      .update(schema.billingQuota)
      .set({ reserved: 10_000 })
      .where(eq(schema.billingQuota.organizationId, s.organizationId));
    const before = await metered(s.organizationId);

    const { assessment } = await assessMetered(s, {
      event: "signup",
      user: { id: "u_2", email: "ada@example.com" },
      content: { text: "Hello" },
    });

    expect(assessment.decision).toBe("allow");
    expect(assessment.degraded).toEqual(["content", "usage_limit", "velocity"]);
    expect(assessment.reasons.map((reason) => reason.code)).not.toContain(
      "duplicate.canonical_mailbox",
    );
    expect(assessment.signals.velocity).toBeNull();
    expect(classified).toBe(0);
    expect(await metered(s.organizationId)).toBe(before);
  });

  test("lists and stateless signals still decide", async () => {
    const s = await setup(gated());
    await useUpAllowance(s.organizationId, NOW);
    await addRiskListEntry(s.live, { list: "block", type: "email", value: "bad@example.com" });
    const listed = await assessMetered(s, { event: "signup", user: { email: "bad@example.com" } });
    expect(listed.assessment.decision).toBe("block");
    const invalid = await assessMetered(s, { event: "signup", user: { email: "not-an-address" } });
    expect(invalid.assessment.reasons.map((reason) => reason.code)).toContain("email.invalid");
    expect(invalid.assessment.degraded).toContain("usage_limit");
  });

  test("a billing hold reduces a paid plan's assessments too", async () => {
    const s = await setup(gated());
    await db.insert(schema.billingHold).values({
      organizationId: s.organizationId,
      reason: "spend_limit",
    });
    const { assessment } = await assessMetered(s, signup);
    expect(assessment.degraded).toContain("usage_limit");
    expect(await metered(s.organizationId)).toBe(0);
    expect(await reserved(s.organizationId, NOW)).toBe(0);
  });

  test("a budget hold on the project reduces its assessments", async () => {
    const s = await setup(gated());
    await db.insert(schema.billingBudgetHold).values({
      organizationId: s.organizationId,
      scope: "project",
      targetId: s.live.projectId,
      periodStart: periodOf(NOW).start,
      spentCents: 100n,
      limitCents: 100n,
    });
    const { assessment } = await assessMetered(s, signup);
    expect(assessment.degraded).toContain("usage_limit");
    expect(await metered(s.organizationId)).toBe(0);
  });
});

describe("classifyContentForCustomer", () => {
  const environment = (s: Setup) => ({
    ...s.live,
    apiKeyId: null,
    userId: null,
  });

  test("stops at Free's allowance", async () => {
    const s = await setup(gated());
    await useUpAllowance(s.organizationId, NOW, "risk.content_checks");
    await expect(classifyContentForCustomer(s.deps, environment(s), "Hello")).rejects.toMatchObject(
      { code: "usage_limit_exceeded" },
    );
    expect(await metered(s.organizationId, "risk.content_checks")).toBe(0);
  });

  test("gives the unit back when the model fails", async () => {
    const s = await setup({ ...gated(), classifier: fakeClassifier({ fail: true }) });
    await expect(classifyContentForCustomer(s.deps, environment(s), "Hello")).rejects.toMatchObject(
      { code: "classification_unavailable" },
    );
    expect(await reserved(s.organizationId, NOW, "risk.content_checks")).toBe(0);
    expect(await metered(s.organizationId, "risk.content_checks")).toBe(0);
  });

  test("a billing hold and a budget are 402s; sandbox is free", async () => {
    const s = await setup(gated());
    await classifyContentForCustomer(s.deps, { ...s.sandbox, apiKeyId: null, userId: null }, "Hi");
    expect(await metered(s.organizationId, "risk.content_checks")).toBe(0);

    await db.insert(schema.billingBudgetHold).values({
      organizationId: s.organizationId,
      scope: "project",
      targetId: s.live.projectId,
      periodStart: periodOf(NOW).start,
      spentCents: 100n,
      limitCents: 100n,
    });
    await expect(classifyContentForCustomer(s.deps, environment(s), "Hello")).rejects.toMatchObject(
      { code: "budget_exceeded" },
    );

    await db.insert(schema.billingHold).values({
      organizationId: s.organizationId,
      reason: "delinquent",
    });
    await expect(classifyContentForCustomer(s.deps, environment(s), "Hello")).rejects.toMatchObject(
      { code: "billing_hold" },
    );
  });
});
