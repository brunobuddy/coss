import { describe, expect, test } from "bun:test";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import type { RiskDeps } from "@coss/risk";
import { testRiskDeps } from "@coss/risk/testing";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { hostedPageScreening } from "../src/hosted.ts";
import { createForm, FakeFormFileStore, type FormEnvironment, submitForm } from "../src/index.ts";
import { CreateFormRequest } from "../src/schemas.ts";
import { TEST_FORM_LINKS, testFormChecks } from "../src/testing.ts";

function counting() {
  const calls = { model: 0, charges: 0 };
  const classifier = {
    name: "counting",
    classify: async () => {
      calls.model++;
      throw new Error("The model must not be asked.");
    },
  } as unknown as RiskDeps["classifier"];
  return {
    calls,
    deps: testRiskDeps({
      classifier,
      chargeClassification: async () => {
        calls.charges++;
        return true;
      },
    }),
  };
}

function liveEnvironment(tenant: TestTenant): FormEnvironment {
  return {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    mode: "live",
  };
}

async function submitWith(riskDeps: ReturnType<typeof testRiskDeps>, tenant: TestTenant) {
  const form = await createForm(
    liveEnvironment(tenant),
    CreateFormRequest.parse({ name: "Intake" }),
    { links: TEST_FORM_LINKS, checks: testFormChecks(["acme.test"]) },
  );
  return submitForm(
    { riskDeps, store: new FakeFormFileStore(), links: TEST_FORM_LINKS },
    {
      formId: form.id,
      fields: [
        ["name", "Ada"],
        ["symptoms", "Chest pain"],
      ],
      files: [],
      ip: "192.0.2.10",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      origin: "https://www.example.com",
      referrer: "https://www.example.com/intake",
    },
  );
}

describe("HIPAA mode", () => {
  test("a hosted page is published without being sent to a model", async () => {
    const tenant = await createTestTenant();
    await enableTestHipaaMode(tenant.organization.id);
    const { deps, calls } = counting();

    const allowed = await hostedPageScreening(deps)({
      organizationId: tenant.organization.id,
      text: "Patient intake form",
    });

    expect(allowed).toBe(true);
    expect(calls).toEqual({ model: 0, charges: 0 });
  });

  test("a live submission is accepted without its text reaching a model", async () => {
    const tenant = await createTestTenant();
    await enableTestHipaaMode(tenant.organization.id);
    const { deps, calls } = counting();

    const result = await submitWith(deps, tenant);

    expect(result.outcome).toBe("accepted");
    expect(calls).toEqual({ model: 0, charges: 0 });
  });

  test("other organizations' submissions do reach it", async () => {
    const tenant = await createTestTenant();
    const { deps, calls } = counting();

    await submitWith(deps, tenant);

    expect(calls.model).toBe(1);
  });
});
