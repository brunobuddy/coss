import { describe, expect, test } from "bun:test";
import { HIPAA_MODE_RESTRICTION, HipaaModeError } from "@coss/compliance";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import type { ContentClassifier } from "@coss/screening/classifier";
import { createTestTenant } from "@coss/tenancy/testing";
import { assessmentContentScores, checkPhone, classifyContent } from "../src/lookups.ts";
import { testRiskDeps } from "../src/testing.ts";

function counting() {
  const calls = { model: 0, charges: 0, lookups: 0 };
  const classifier = {
    name: "counting",
    classify: async () => {
      calls.model++;
      return { scores: {}, model: "counting" };
    },
  } as unknown as ContentClassifier;
  const deps = testRiskDeps({
    classifier,
    chargeClassification: async () => {
      calls.charges++;
      return true;
    },
    phoneLookup: {
      name: "counting",
      lookup: async () => {
        calls.lookups++;
        return { country: "US", lineType: "mobile", carrier: null, simSwap: null };
      },
    } as never,
  });
  return { deps, calls };
}

async function tenantInMode() {
  const tenant = await createTestTenant();
  await enableTestHipaaMode(tenant.organization.id);
  return tenant.organization.id;
}

describe("HIPAA mode", () => {
  test("classifying live text is refused before it reaches the model", async () => {
    const organizationId = await tenantInMode();
    const { deps, calls } = counting();
    const error = await classifyContent(
      deps,
      { organizationId, mode: "live" },
      "Patient has a condition",
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HipaaModeError);
    expect((error as HipaaModeError).code).toBe(HIPAA_MODE_RESTRICTION);
    expect(calls.model).toBe(0);
  });

  test("an assessment goes on without scores, isn't charged and isn't degraded", async () => {
    const organizationId = await tenantInMode();
    const { deps, calls } = counting();
    const result = await assessmentContentScores(
      deps,
      { organizationId, mode: "live" },
      "A submitted form about a patient",
    );
    expect(result).toEqual({ scores: null, degraded: false });
    expect(calls).toMatchObject({ model: 0, charges: 0 });
  });

  test("sandbox environments keep their markers, which reach no vendor", async () => {
    const organizationId = await tenantInMode();
    const { deps, calls } = counting();
    const { scores } = await classifyContent(
      deps,
      { organizationId, mode: "sandbox" },
      "[coss-test:phishing]",
    );
    expect(scores.phishing).toBeGreaterThan(0.5);
    expect(calls.model).toBe(0);
  });

  test("live phone checks are refused while Twilio Lookup isn't covered", async () => {
    const organizationId = await tenantInMode();
    const { deps, calls } = counting();
    await expect(
      checkPhone(deps, { organizationId, mode: "live" } as never, "+14155550123"),
    ).rejects.toBeInstanceOf(HipaaModeError);
    expect(calls.lookups).toBe(0);
  });
});
