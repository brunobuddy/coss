import { expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { EmailError, FakeEmailProvider } from "@coss/email";
import { SendEmailRequest } from "@coss/email/schemas";
import { createVerifiedDomain, dispatchingEmailService } from "@coss/email/testing";
import { memoryLimiter } from "@coss/ratelimit/testing";
import { buildIcs, type SchedulingEmail } from "@coss/scheduling";
import { SmsError } from "@coss/sms";
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
    cossSubject: "Confirmed: Consultation",
    cossText: "Your booking is confirmed.",
    cossHtml: "<p>Your booking is confirmed.</p>",
    replyTo: null,
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
    logo: null,
    idempotencyKey: `scheduling:${crypto.randomUUID()}`,
    ownSenderOnly: false,
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

test("coss.com's address never sends the copy with the customer's name on top", async () => {
  const tenant = await createTestTenant();
  const coss = await createTestTenant();
  const sent: { environmentId: string; html: string | undefined }[] = [];
  const notifier = schedulingNotifier({
    service: {
      async send(input) {
        sent.push({
          environmentId: input.environment.environmentId,
          html: input.params.html ?? undefined,
        });
        if (input.environment.environmentId === tenant.production.id) {
          throw new EmailError("domain_not_verified", "Not verified.");
        }
        return { replayed: false } as never;
      },
    },
    limiter: memoryLimiter(),
    fallback: {
      environment: {
        organizationId: coss.organization.id,
        projectId: coss.project.id,
        environmentId: coss.production.id,
        mode: "live",
      },
      address: "notifications@coss.test",
    },
  });
  const message = await email({
    environment: {
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.production.id,
      mode: "live",
    },
    from: "bookings@acme.test",
    html: "<p>branded</p>",
    cossHtml: "<p>coss</p>",
  });
  await notifier.email(message);
  expect(sent).toEqual([
    { environmentId: tenant.production.id, html: "<p>branded</p>" },
    { environmentId: coss.production.id, html: "<p>coss</p>" },
  ]);
});

test("the logo goes inline with the customer's copy, and never with coss.com's", async () => {
  const tenant = await createTestTenant();
  const coss = await createTestTenant();
  const sent: { environmentId: string; attachments: unknown }[] = [];
  const notifier = schedulingNotifier({
    service: {
      async send(input) {
        sent.push({
          environmentId: input.environment.environmentId,
          attachments: input.params.attachments?.map((attachment) => attachment.content_id ?? null),
        });
        if (input.environment.environmentId === tenant.production.id) {
          throw new EmailError("domain_not_verified", "Not verified.");
        }
        return { replayed: false } as never;
      },
    },
    limiter: memoryLimiter(),
    fallback: {
      environment: {
        organizationId: coss.organization.id,
        projectId: coss.project.id,
        environmentId: coss.production.id,
        mode: "live",
      },
      address: "notifications@coss.test",
    },
  });
  const message = await email({
    environment: {
      organizationId: tenant.organization.id,
      projectId: tenant.project.id,
      environmentId: tenant.production.id,
      mode: "live",
    },
    from: "bookings@acme.test",
    ics: null,
    logo: {
      filename: "logo.png",
      content: Buffer.from("logo").toString("base64"),
      contentType: "image/png",
      contentId: "logo@acme",
    },
  });
  await notifier.email(message);
  expect(sent).toEqual([
    { environmentId: tenant.production.id, attachments: ["logo@acme"] },
    { environmentId: coss.production.id, attachments: undefined },
  ]);
});

test("what a customer wrote, and where replies go, never leave under coss.com's address", async () => {
  const tenant = await createTestTenant();
  const coss = await createTestTenant();
  const sent: Record<string, unknown>[] = [];
  const notifier = schedulingNotifier({
    service: {
      async send(input) {
        sent.push({
          subject: input.params.subject,
          text: input.params.text,
          html: input.params.html,
          replyTo: input.params.reply_to,
        });
        if (input.environment.environmentId === tenant.production.id) {
          throw new EmailError("domain_not_verified", "Not verified.");
        }
        return { replayed: false } as never;
      },
    },
    limiter: memoryLimiter(),
    fallback: {
      environment: {
        organizationId: coss.organization.id,
        projectId: coss.project.id,
        environmentId: coss.production.id,
        mode: "live",
      },
      address: "notifications@coss.test",
    },
  });
  await notifier.email(
    await email({
      environment: {
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.production.id,
        mode: "live",
      },
      from: "bookings@acme.test",
      subject: "Their subject",
      text: "Their words",
      html: "<p>Their words</p>",
      cossSubject: "Reminder: Consultation",
      cossText: "This is coming up.",
      cossHtml: "<p>This is coming up.</p>",
      replyTo: "desk@acme.test",
      ics: null,
    }),
  );
  expect(sent).toEqual([
    {
      subject: "Their subject",
      text: "Their words",
      html: "<p>Their words</p>",
      replyTo: ["desk@acme.test"],
    },
    {
      subject: "Reminder: Consultation",
      text: "This is coming up.",
      html: "<p>This is coming up.</p>",
      replyTo: [],
    },
  ]);
});

test("mail to a guest never falls back to coss.com's sender", async () => {
  const tenant = await createTestTenant();
  const fallbackTenant = await createTestTenant();
  const fallbackDomain = await createVerifiedDomain(fallbackTenant.organization.id);
  const environment = {
    organizationId: tenant.organization.id,
    projectId: tenant.project.id,
    environmentId: tenant.production.id,
    mode: "live" as const,
  };
  const notifier = schedulingNotifier({
    service: service(),
    limiter: memoryLimiter(),
    fallback: {
      environment: {
        organizationId: fallbackTenant.organization.id,
        projectId: fallbackTenant.project.id,
        environmentId: fallbackTenant.production.id,
        mode: "live",
      },
      address: `appointments@${fallbackDomain.name}`,
    },
  });
  // An address on a domain nobody has verified, as when a customer's stops being verified.
  const guest = await email({
    environment,
    from: "appointments@not-verified.example",
    ownSenderOnly: true,
  });
  expect(await notifier.email(guest)).toBe("not_sent");
  const sent = await db
    .select()
    .from(schema.email)
    .where(eq(schema.email.idempotencyKey, guest.idempotencyKey));
  expect(sent).toEqual([]);
  // Everyone else's still does.
  const attendee = await email({ environment, from: "appointments@not-verified.example" });
  await notifier.email(attendee);
  const fellBack = await db
    .select({ from: schema.email.from })
    .from(schema.email)
    .where(eq(schema.email.idempotencyKey, attendee.idempotencyKey));
  expect(fellBack[0]?.from).toContain("via coss.com");
});

test("a text already accepted isn't refused for reading differently on a retry", async () => {
  const message = await email();
  const asked: string[] = [];
  const notifier = schedulingNotifier({
    service: service(),
    sms: {
      async send(input) {
        asked.push(input.params.body);
        // What the real service says when a key comes back with a different body.
        if (asked.length > 1) throw new SmsError("idempotency_key_reused", "Reused.");
        return { replayed: false } as never;
      },
    },
    limiter: memoryLimiter(),
    fallback: null,
  });
  const text = {
    environment: message.environment,
    from: "+15550001111",
    to: "+15550002222",
    idempotencyKey: "scheduling:row:host",
  };
  await notifier.sms?.({ ...text, body: "It's in 30 minutes." });
  await notifier.sms?.({ ...text, body: "It's in 28 minutes." });
  expect(asked.length).toBe(2);
});

test("any other refusal of a text still fails, and is retried", async () => {
  const message = await email();
  const notifier = schedulingNotifier({
    service: service(),
    sms: {
      async send() {
        throw new SmsError("sender_not_verified" as never, "Not yours.");
      },
    },
    limiter: memoryLimiter(),
    fallback: null,
  });
  await expect(
    notifier.sms?.({
      environment: message.environment,
      from: "+15550001111",
      to: "+15550002222",
      body: "Hello",
      idempotencyKey: "scheduling:row:other",
    }),
  ).rejects.toThrow("Not yours.");
});
