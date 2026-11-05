import { describe, expect, spyOn, test } from "bun:test";
import { db, schema } from "@coss/db";
import { createTestTenant } from "@coss/tenancy/testing";
import { reportDispatchBacklog } from "../src/backlog.ts";

const MINUTE = 60_000;

describe("reportDispatchBacklog", () => {
  test("reports only unclaimed messages past the threshold, with counts and no details", async () => {
    const tenant = await createTestTenant();
    const scope = { organizationIds: [tenant.organization.id] };
    const now = new Date();
    const email = (minutesAgo: number, provider: string | null = null) => ({
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.production.id,
      from: "Acme <hello@acme.test>",
      to: ["secret-person@example.test"],
      subject: "Hello",
      status: "queued" as const,
      provider,
      createdAt: new Date(now.getTime() - minutesAgo * MINUTE),
    });
    await db.insert(schema.email).values([email(2), email(16), email(40), email(40, "ses")]);

    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      await reportDispatchBacklog({ now, scope });
      expect(errors).toHaveBeenCalledTimes(1);
      const line = String(errors.mock.calls[0]?.[0]);
      expect(line).toContain("2 emails waiting for dispatch, the oldest for 40 minutes");
      expect(line).not.toContain("example.test");
    } finally {
      errors.mockRestore();
    }
  });

  test("says nothing when dispatch keeps up", async () => {
    const tenant = await createTestTenant();
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      await reportDispatchBacklog({ scope: { organizationIds: [tenant.organization.id] } });
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});
