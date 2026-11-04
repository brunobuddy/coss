import { describe, expect, test } from "bun:test";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import { db, schema } from "@coss/db";
import { newId } from "@coss/db/id";
import { updateReputationPolicy } from "@coss/reputation";
import { createTestTenant, createTestUser } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import type { ContentClassifier } from "../src/classifier.ts";
import { screenMessage } from "../src/screen.ts";

function countingClassifier() {
  const calls = { count: 0 };
  const classifier: ContentClassifier = {
    name: "counting",
    classify: async () => {
      calls.count++;
      return {
        scores: { phishing: 0, malware: 0, spam: 0, hate: 0, sexual: 0, violence: 0 },
        model: "counting",
        inputTokens: null,
      } as never;
    },
  };
  return { classifier, calls };
}

describe("HIPAA mode", () => {
  test("no message reaches the model, and nothing is held, sampled or recorded", async () => {
    const tenant = await createTestTenant();
    await enableTestHipaaMode(tenant.organization.id);
    const { classifier, calls } = countingClassifier();
    const content = () => {
      throw new Error("Content must not even be prepared.");
    };

    const outcome = await screenMessage(
      {
        organizationId: tenant.organization.id,
        environmentId: tenant.production.id,
        product: "email",
        subjectId: newId("email"),
        force: true,
        content,
      },
      { classifier },
    );

    expect(outcome).toEqual({ action: "send", screening: null });
    expect(calls.count).toBe(0);
    const verdicts = await db
      .select()
      .from(schema.contentScreening)
      .where(eq(schema.contentScreening.organizationId, tenant.organization.id));
    expect(verdicts).toEqual([]);
  });

  test("an admin's policy override can't turn screening back on", async () => {
    const tenant = await createTestTenant();
    const admin = await createTestUser();
    await enableTestHipaaMode(tenant.organization.id);
    await updateReputationPolicy({
      organizationId: tenant.organization.id,
      overrides: { contentScreening: { enabled: true, alwaysFirst: 100 } },
      adminUserId: admin.id,
    });
    const { classifier, calls } = countingClassifier();

    await screenMessage(
      {
        organizationId: tenant.organization.id,
        environmentId: tenant.production.id,
        product: "sms",
        subjectId: newId("sms"),
        content: () => ({ kind: "sms", from: "+14155550123", body: "Your results", links: [] }),
      },
      { classifier },
    );

    expect(calls.count).toBe(0);
  });

  test("other organizations are screened as usual", async () => {
    const tenant = await createTestTenant();
    const { classifier, calls } = countingClassifier();
    await screenMessage(
      {
        organizationId: tenant.organization.id,
        environmentId: tenant.production.id,
        product: "email",
        subjectId: newId("email"),
        content: () => ({
          kind: "email",
          from: "a@example.com",
          subject: "Hi",
          text: "Hello",
          links: [],
        }),
      },
      { classifier },
    );
    expect(calls.count).toBe(1);
  });
});
