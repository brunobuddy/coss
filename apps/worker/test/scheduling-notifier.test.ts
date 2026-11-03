import { expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { FakeEmailProvider } from "@coss/email";
import { SendEmailRequest } from "@coss/email/schemas";
import { createVerifiedDomain, dispatchingEmailService } from "@coss/email/testing";
import { memoryLimiter } from "@coss/ratelimit/testing";
import { buildIcs, type SchedulingEmail } from "@coss/scheduling";
import { createTestTenant } from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import { schedulingNotifier } from "../src/scheduling-notifier.ts";

async function email(overrides: Partial<SchedulingEmail> = {}): Promise<SchedulingEmail> {
  const tenant = await createTestTenant();
  return {
    environment: {
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.development.id,
      mode: "sandbox",
    },
    from: null,
    senderName: "Acme Health",
    to: "sam@example.com",
    subject: "Confirmed: Consultation",
    text: "Your booking is confirmed.",
    html: "<p>Your booking is confirmed.</p>",
    ics: {
      filename: "booking.ics",
      method: "REQUEST",
      content: buildIcs({
        uid: "book_1@coss.com",
        title: "Consultation",
        startMs: Date.parse("2031-01-06T09:00:00Z"),
        endMs: Date.parse("2031-01-06T09:30:00Z"),
        stampMs: Date.parse("2031-01-01T00:00:00Z"),
        method: "REQUEST",
      }),
    },
    idempotencyKey: `scheduling:${crypto.randomUUID()}`,
    ...overrides,
  };
}

function service(screened: string[] = []) {
  return dispatchingEmailService({
    liveProvider: new FakeEmailProvider({ log: false }),
    sandboxProvider: new FakeEmailProvider({ log: false }),
    screen: async (input) => {
      screened.push(input.subjectId);
      return { action: "send", screening: null };
    },
  });
}

test("a booking email goes through the email product: an invitation, with no tracking", async () => {
  const notifier = schedulingNotifier({
    service: service(),
    limiter: memoryLimiter(),
    fallback: null,
  });
  const message = await email();
  await notifier.email(message);
  const [row] = await db
    .select()
    .from(schema.email)
    .where(eq(schema.email.idempotencyKey, message.idempotencyKey));
  expect(row?.screeningExempt).toBe(true);
  expect(row?.trackOpens).toBe(false);
  expect(row?.trackClicks).toBe(false);
  expect(row?.from).toContain("Acme Health via coss.com");
  expect(row?.subject).toBe("Confirmed: Consultation");
  const attachments = await db
    .select()
    .from(schema.emailAttachment)
    .where(eq(schema.emailAttachment.emailId, row?.id as string));
  expect(attachments.map((attachment) => attachment.filename)).toEqual(["booking.ics"]);
  expect(attachments[0]?.contentType).toBe("text/calendar");
  // Sending it twice sends it once.
  await notifier.email(message);
  const rows = await db
    .select()
    .from(schema.email)
    .where(eq(schema.email.idempotencyKey, message.idempotencyKey));
  expect(rows.length).toBe(1);
});

test("a live booking email skips per-email screening; an ordinary send doesn't", async () => {
  const tenant = await createTestTenant();
  const domain = await createVerifiedDomain(tenant.organization.id);
  const environment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    mode: "live" as const,
  };
  const screened: string[] = [];
  const emailService = service(screened);
  const notifier = schedulingNotifier({
    service: emailService,
    limiter: memoryLimiter(),
    fallback: null,
  });
  const message = await email({ environment, from: `appointments@${domain.name}` });
  await notifier.email(message);
  const [booking] = await db
    .select()
    .from(schema.email)
    .where(eq(schema.email.idempotencyKey, message.idempotencyKey));
  expect(booking?.screeningExempt).toBe(true);
  expect(booking?.discardBody).toBe(true);
  expect(screened).toEqual([]);

  const { email: ordinary } = await emailService.send({
    environment,
    apiKeyId: null,
    params: SendEmailRequest.parse({
      from: `hello@${domain.name}`,
      to: "sam@example.com",
      subject: "Hello",
      text: "Hello",
    }),
  });
  expect(screened).toEqual([ordinary.id]);
});

test("the public API can't ask to skip screening", () => {
  const parsed = SendEmailRequest.safeParse({
    from: "a@example.com",
    to: "b@example.com",
    subject: "x",
    text: "x",
    screening_exempt: true,
  });
  expect(parsed.success).toBe(false);
});

test("a live email with no sender of its own and no fallback waits, rather than vanishing", async () => {
  const notifier = schedulingNotifier({
    service: service(),
    limiter: memoryLimiter(),
    fallback: null,
  });
  const message = await email();
  const live = { ...message, environment: { ...message.environment, mode: "live" as const } };
  await expect(notifier.email(live)).rejects.toThrow("coss.com's sender");
});
