/**
 * Emails to the organization's owners and admins about its senders (`@coss/notifications`): a
 * number that still needs its sender registered, a registration in review, approved or not. Each
 * is queued in the transaction that decides it; its content is read again when the worker sends
 * it, so one whose news is stale by then (the number registered meanwhile, a review already
 * decided) is skipped.
 */

import { orgLinkHref } from "@coss/dashboard-routes";
import { db, type Executor, schema } from "@coss/db";
import { type EmailBlock, type EmailStep, oneLine } from "@coss/email-layout";
import {
  enqueueNotification,
  type NotificationContext,
  type NotificationKinds,
} from "@coss/notifications";
import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";

const { smsNumber, smsRegistration } = schema;

const HOUR = 60 * 60 * 1000;
/** How long after a purchase the "register it" reminder waits (the dialog already asked). */
export const SMS_REGISTRATION_REMINDER_DELAY_MS = HOUR;

const DOCS_URL = "https://coss.com/docs/sms/sending";
const IN_PROGRESS = ["submitted", "in_review"] as const;

type RegistrationRow = typeof smsRegistration.$inferSelect;
type NumberRow = typeof smsNumber.$inferSelect;

/** Queues the reminder to register a number's sender (in the purchase's transaction). */
export async function enqueueSmsNumberReminder(
  tx: Executor,
  number: Pick<NumberRow, "id" | "organizationId" | "kind">,
  now: Date,
): Promise<void> {
  await enqueueNotification(tx, {
    organizationId: number.organizationId,
    kind: "sms.number_needs_registration",
    // One 10DLC registration covers every local number: at most one reminder a day for them.
    dedupeKey: number.kind === "local" ? `local:${now.toISOString().slice(0, 10)}` : number.id,
    payload: { numberId: number.id },
    notBefore: new Date(now.getTime() + SMS_REGISTRATION_REMINDER_DELAY_MS),
    now,
  });
}

/** Queues the email of a registration's submission or review outcome (in its transaction). */
export async function enqueueSmsRegistrationNotice(
  tx: Executor,
  registration: Pick<RegistrationRow, "id" | "organizationId">,
  event: "submitted" | "approved" | "rejected",
  now: Date,
): Promise<void> {
  await enqueueNotification(tx, {
    organizationId: registration.organizationId,
    kind: `sms.registration_${event}`,
    dedupeKey: registration.id,
    payload: { registrationId: registration.id },
    now,
  });
}

function what(kind: RegistrationRow["kind"]): string {
  return kind === "us_10dlc" ? "US A2P 10DLC registration" : "toll-free verification";
}

function formatDate(date: Date): string {
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

async function registrationOf(context: NotificationContext): Promise<RegistrationRow | null> {
  const [row] = await db
    .select()
    .from(smsRegistration)
    .where(
      and(
        eq(smsRegistration.id, String(context.payload.registrationId)),
        eq(smsRegistration.organizationId, context.organizationId),
      ),
    );
  return row ?? null;
}

/** The numbers a registration covers: its toll-free number, or the local numbers under it. */
async function coveredNumbers(registration: RegistrationRow): Promise<string[]> {
  const rows = await db
    .select({ phoneNumber: smsNumber.phoneNumber })
    .from(smsNumber)
    .where(
      and(
        eq(smsNumber.organizationId, registration.organizationId),
        registration.kind === "toll_free" && registration.numberId
          ? eq(smsNumber.id, registration.numberId)
          : eq(smsNumber.registrationId, registration.id),
        inArray(smsNumber.status, ["pending", "active"]),
      ),
    )
    .orderBy(asc(smsNumber.createdAt));
  return rows.map((row) => row.phoneNumber);
}

function numbersLabel(numbers: string[], kind: RegistrationRow["kind"]): string {
  if (numbers.length === 0) return kind === "us_10dlc" ? "Every local number you buy" : "—";
  return numbers.join(", ");
}

function registerPath(slug: string, registration: Pick<RegistrationRow, "kind" | "numberId">) {
  return registration.kind === "toll_free" && registration.numberId
    ? orgLinkHref(slug, `/sms/numbers/register?number=${encodeURIComponent(registration.numberId)}`)
    : orgLinkHref(slug, "/sms/numbers/register?kind=us_10dlc");
}

function details(registration: RegistrationRow, numbers: string[]): EmailBlock {
  return {
    details: [
      { label: "Business", value: oneLine(registration.profile.legalName) },
      {
        label: "Registration",
        value: registration.kind === "us_10dlc" ? "US A2P 10DLC" : "Toll-free verification",
      },
      {
        label: numbers.length === 1 ? "Number" : "Numbers",
        value: numbersLabel(numbers, registration.kind),
      },
      ...(registration.submittedAt
        ? [{ label: "Submitted", value: formatDate(registration.submittedAt) }]
        : []),
    ],
  };
}

export const SMS_NOTIFICATION_KINDS: NotificationKinds = {
  "sms.number_needs_registration": {
    async render(context) {
      const [number] = await db
        .select()
        .from(smsNumber)
        .where(
          and(
            eq(smsNumber.id, String(context.payload.numberId)),
            eq(smsNumber.organizationId, context.organizationId),
          ),
        );
      if (!number || number.status === "releasing") return { skip: "The number was released." };
      const local = number.kind === "local";
      // Registered since? A local number counts once any 10DLC registration is under way.
      const [registered] = await db
        .select({ id: smsRegistration.id })
        .from(smsRegistration)
        .where(
          and(
            eq(smsRegistration.organizationId, context.organizationId),
            local ? eq(smsRegistration.kind, "us_10dlc") : eq(smsRegistration.numberId, number.id),
            inArray(smsRegistration.status, [...IN_PROGRESS, "approved"]),
          ),
        )
        .limit(1);
      if (registered) return { skip: "A registration is already under way." };
      const { slug } = context.organization;
      const steps: EmailStep[] = [
        { label: "Buy a number", detail: number.phoneNumber, state: "done" },
        {
          label: local ? "Register your business" : "Verify the number",
          detail: "Your business, its representative and sample messages",
          state: "current",
        },
        { label: "Carrier review", detail: "Usually a few days", state: "upcoming" },
        { label: "Start sending", state: "upcoming" },
      ];
      return {
        subject: local
          ? `Register your business to send SMS from ${number.phoneNumber}`
          : `Verify ${number.phoneNumber} to send SMS`,
        title: "One step left before you can send",
        blocks: [
          {
            paragraph: local
              ? `${number.phoneNumber} is ready, but US carriers only deliver messages from local numbers registered for A2P 10DLC. Register your business once: every local number you buy sends under that registration.`
              : `${number.phoneNumber} is ready, but carriers only deliver messages from toll-free numbers that have been verified. Tell us about your business and the messages you'll send, and we'll submit the verification.`,
          },
          { steps },
          {
            button: {
              label: local ? "Register your business" : "Verify the number",
              url: context.url(
                local
                  ? orgLinkHref(slug, "/sms/numbers/register?kind=us_10dlc")
                  : orgLinkHref(
                      slug,
                      `/sms/numbers/register?number=${encodeURIComponent(number.id)}`,
                    ),
              ),
            },
          },
          {
            note: "Until then, live messages from this number are refused. Sandbox environments keep simulating messages, so you can build and test in the meantime.",
          },
        ],
      };
    },
  },

  "sms.registration_submitted": {
    async render(context) {
      const registration = await registrationOf(context);
      if (!registration) return { skip: "The registration is gone." };
      // Already decided: the outcome's own email says so.
      if (!(IN_PROGRESS as readonly string[]).includes(registration.status)) {
        return { skip: "The review is already decided." };
      }
      const numbers = await coveredNumbers(registration);
      const business = oneLine(registration.profile.legalName);
      return {
        subject: `${business}'s ${what(registration.kind)} is in review`,
        title: "Your SMS registration is in review",
        blocks: [
          {
            paragraph: `We've submitted ${business}'s ${what(registration.kind)} to the carriers and are following their review. There's nothing else for you to do: we'll email you as soon as they decide.`,
          },
          details(registration, numbers),
          {
            steps: [
              {
                label: "Submitted",
                detail: registration.submittedAt ? formatDate(registration.submittedAt) : undefined,
                state: "done",
              },
              { label: "Carrier review", detail: "Usually a few days", state: "current" },
              {
                label: "Start sending",
                detail: "Automatically, once it's approved",
                state: "upcoming",
              },
            ],
          },
          {
            button: {
              label: "View the registration",
              url: context.url(
                orgLinkHref(
                  context.organization.slug,
                  `/sms/numbers?registered=${encodeURIComponent(registration.id)}`,
                ),
              ),
            },
          },
          {
            note:
              registration.kind === "us_10dlc"
                ? "Carriers' brand and campaign fees are passed through at cost. Sandbox environments keep simulating messages while you wait."
                : "Sandbox environments keep simulating messages while you wait.",
          },
        ],
      };
    },
  },

  "sms.registration_approved": {
    async render(context) {
      const registration = await registrationOf(context);
      if (registration?.status !== "approved") return { skip: "Not approved (anymore)." };
      const numbers = await coveredNumbers(registration);
      const business = oneLine(registration.profile.legalName);
      const from = numbers[0] ?? "+1…";
      return {
        subject: `${business} is approved to send SMS`,
        title: "You can send SMS now",
        blocks: [
          {
            paragraph: `Carriers approved ${business}'s ${what(registration.kind)}. Live messages can go from ${
              numbers.length === 0
                ? "the local numbers you buy"
                : numbers.length === 1
                  ? from
                  : "these numbers"
            } now.`,
          },
          details(registration, numbers),
          {
            steps: [
              { label: "Submitted", state: "done" },
              { label: "Carrier review", detail: "Approved", state: "done" },
              { label: "Start sending", state: "done" },
            ],
          },
          { heading: "Send your first message" },
          {
            code: `await coss.sms.send({\n  from: "${from}",\n  to: "+14155550123",\n  body: "Your order has shipped.",\n});`,
          },
          {
            button: {
              label: "Open SMS",
              url: context.url(orgLinkHref(context.organization.slug, "/sms/numbers")),
            },
          },
          { link: { label: "Read the guide to sending SMS", url: DOCS_URL } },
          {
            note: "Keep your messages to what the registration describes: carriers filter traffic that doesn't match it.",
          },
        ],
      };
    },
  },

  "sms.registration_rejected": {
    async render(context) {
      const registration = await registrationOf(context);
      if (registration?.status !== "rejected" && registration?.status !== "failed") {
        return { skip: "Not rejected (anymore)." };
      }
      // Registered again since (the same toll-free number, or a new 10DLC registration):
      // "register again" is old news.
      const [newer] = await db
        .select({ id: smsRegistration.id })
        .from(smsRegistration)
        .where(
          and(
            eq(smsRegistration.organizationId, context.organizationId),
            eq(smsRegistration.kind, registration.kind),
            registration.kind === "toll_free" && registration.numberId
              ? eq(smsRegistration.numberId, registration.numberId)
              : undefined,
            ne(smsRegistration.id, registration.id),
            // Postgres keeps microseconds, the Date only milliseconds: `gte`, minus this row.
            gte(smsRegistration.createdAt, registration.createdAt),
          ),
        )
        .limit(1);
      if (newer) return { skip: "Registered again since." };
      const numbers = await coveredNumbers(registration);
      const business = oneLine(registration.profile.legalName);
      return {
        subject: `${business}'s ${what(registration.kind)} wasn't approved`,
        title: "Your SMS registration needs changes",
        blocks: [
          {
            paragraph: `Carriers didn't approve ${business}'s ${what(registration.kind)}, so its numbers can't send live messages yet.`,
          },
          ...(registration.rejectionReason
            ? [{ heading: "What they said" }, { paragraph: oneLine(registration.rejectionReason) }]
            : []),
          details(registration, numbers),
          {
            steps: [
              { label: "Submitted", state: "done" },
              { label: "Carrier review", detail: "Not approved", state: "failed" },
              { label: "Start sending", state: "upcoming" },
            ],
          },
          {
            paragraph:
              "Check that the business details match your tax records exactly, and that the description, opt-in and samples describe the messages you'll actually send. Then register again.",
          },
          {
            button: {
              label: "Register again",
              url: context.url(registerPath(context.organization.slug, registration)),
            },
          },
        ],
      };
    },
  },
};
