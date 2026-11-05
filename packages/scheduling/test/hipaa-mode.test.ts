import { describe, expect, test } from "bun:test";
import { enableTestHipaaMode } from "@coss/compliance/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { checkReminders, normalizeReminders } from "../src/reminders.ts";
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

  test("reminder text isn't sent to a model either, and still can't hold a link", async () => {
    const tenant = await createTestTenant();
    await enableTestHipaaMode(tenant.organization.id);
    let asked = 0;
    const env = { organizationId: tenant.organization.id, mode: "live" as const };
    const checks = {
      screen: async () => {
        asked++;
        return false;
      },
    };
    const message = (text: string) =>
      normalizeReminders([
        { anchor: "start", before_minutes: 60, send: ["email_attendee"], message: text },
      ]);
    await checkReminders(env, message("Your oncology visit is soon."), "a@example.com", checks);
    expect(asked).toBe(0);
    await expect(
      checkReminders(env, message("Book at evil.com"), "a@example.com", checks),
    ).rejects.toThrow(/link/);
  });
});
