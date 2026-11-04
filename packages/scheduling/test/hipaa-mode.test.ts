import { describe, expect, test } from "bun:test";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { screenSetup } from "../src/screening.ts";

describe("HIPAA mode", () => {
  test("setup text isn't sent to a model", async () => {
    const tenant = await createTestTenant();
    await enableTestHipaaMode(tenant.organization.id);
    let asked = 0;

    await screenSetup(
      { organizationId: tenant.organization.id, mode: "live" },
      "Oncology consultation",
      async () => {
        asked++;
        return false;
      },
      "title",
    );

    expect(asked).toBe(0);
  });

  test("other organizations' setup text is screened", async () => {
    const tenant = await createTestTenant();
    let asked = 0;

    await screenSetup(
      { organizationId: tenant.organization.id, mode: "live" },
      "Consultation",
      async () => {
        asked++;
        return true;
      },
      "title",
    );

    expect(asked).toBe(1);
  });
});
