import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ refresh: mock() }));
mock.module("next/navigation", () => ({ unstable_rethrow: () => {} }));
mock.module("@/lib/session", () => ({
  requireOrgPermission: async () => ({
    organization: { id: "org_1", slug: "acme" },
    session: { user: { id: "user_1" } },
  }),
}));
const tenancyModule = await import("@coss/tenancy");
mock.module("@coss/tenancy", () => ({
  ...tenancyModule,
  getEnvironment: async () => ({ project: { id: "proj_1" }, environment: { id: "env_1" } }),
}));
const rescheduleEmail = mock(async (input: { emailId: string; scheduledAt: string }) => ({
  id: input.emailId,
  scheduled_at: new Date(input.scheduledAt).toISOString(),
}));
const emailModule = await import("@coss/email");
mock.module("@coss/email", () => ({ ...emailModule, rescheduleEmail }));
const recordAudit = mock(async (_session: unknown, _input: unknown) => {});
mock.module("@/lib/audit", () => ({ recordAudit }));

const { rescheduleEmailAction } = await import(
  "../src/app/[orgSlug]/[projectSlug]/[envSlug]/email/messages/[emailId]/actions"
);

function form(scheduledAt: string): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    orgSlug: "acme",
    projectSlug: "default",
    envSlug: "development",
    emailId: "email_1",
    scheduledAt,
  })) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  rescheduleEmail.mockClear();
  recordAudit.mockClear();
});

describe("rescheduling from the dashboard", () => {
  test("records the same audit event as the API", async () => {
    const at = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const result = await rescheduleEmailAction(null, form(at.slice(0, 16)));
    expect(result).toMatchObject({ ok: true });
    expect(recordAudit.mock.calls[0]?.[1]).toEqual({
      organizationId: "org_1",
      action: "email.rescheduled",
      target: { type: "email", id: "email_1" },
      projectId: "proj_1",
      environmentId: "env_1",
      metadata: { scheduled_at: `${at.slice(0, 16)}:00.000Z` },
    });
  });

  test("records nothing when the time is refused", async () => {
    expect(await rescheduleEmailAction(null, form("tomorrow"))).toMatchObject({ ok: false });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
