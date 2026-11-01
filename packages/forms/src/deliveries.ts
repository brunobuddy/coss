/**
 * The worker's `forms` loop: what accepted (and pending) submissions still owe, one
 * `form_delivery` row per kind — the owner's notification email, the contact, the submitter's
 * verification email. System-level: `scope` narrows it in tests. Rows are leased by moving
 * `next_attempt_at` forward (a crashed worker's lease simply runs out), retried with backoff and
 * given up after `MAX_DELIVERY_ATTEMPTS`. A suspended organization's deliveries wait until it is
 * reinstated: coss.com's sender must never carry its mail.
 */

import { environmentHref } from "@coss/dashboard-routes";
import { db, schema } from "@coss/db";
import { and, asc, eq, inArray, lte, notExists, sql } from "drizzle-orm";
import {
  type FormContactSink,
  type FormMailer,
  notificationContent,
  verificationContent,
} from "./emails.ts";
import { contactsOf, type FormRow, formEndpoint, memberAddresses } from "./forms.ts";
import type { FormSubmissionRow } from "./record.ts";
import {
  mintConfirmationToken,
  restoreConfirmationToken,
  storeConfirmationToken,
} from "./release.ts";
import { FORM_CONFIRMATION_TTL_MS } from "./schemas.ts";

const {
  environment,
  form,
  formDelivery,
  formSubmission,
  formSubmissionFile,
  organization,
  organizationSuspension,
  project,
} = schema;

export const MAX_DELIVERY_ATTEMPTS = 10;
const LEASE_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

export type FormDeliveryDeps = {
  mailer: FormMailer;
  contacts: FormContactSink;
  /** `FORMS_PUBLIC_URL`: where verification links point. */
  formsUrl: string;
  /** The dashboard's origin (`BETTER_AUTH_URL`): notifications link to the submission there. */
  dashboardUrl: string;
  /**
   * Whether an address is on one of the organization's verified domains (`authorizeLiveSender`):
   * live notification recipients are checked again at every send, as when the form was saved.
   */
  verifiedAddress(input: { organizationId: string; address: string }): Promise<boolean>;
  /**
   * Charges the verification limits (the organization's, and the address's across every
   * organization); `null`: the email isn't sent and the submission stays unconfirmed. `refund`
   * gives the charge back when nothing was sent (the attempt is retried).
   */
  admitVerification?: (input: {
    organizationId: string;
    address: string;
  }) => Promise<{ refund(): Promise<void> } | null>;
};

type DeliveryRow = typeof formDelivery.$inferSelect;
type Outcome = "delivered" | "skipped";

type Loaded = {
  submission: FormSubmissionRow;
  form: FormRow;
  mode: "live" | "sandbox";
  slugs: { organization: string; project: string; environment: string };
};

async function load(row: DeliveryRow): Promise<Loaded | null> {
  const [found] = await db
    .select({
      submission: formSubmission,
      form,
      mode: environment.mode,
      environmentSlug: environment.slug,
      projectSlug: project.slug,
      organizationSlug: organization.slug,
    })
    .from(formSubmission)
    .innerJoin(
      form,
      and(
        eq(form.id, formSubmission.formId),
        eq(form.organizationId, formSubmission.organizationId),
      ),
    )
    .innerJoin(
      environment,
      and(
        eq(environment.id, formSubmission.environmentId),
        eq(environment.organizationId, formSubmission.organizationId),
      ),
    )
    .innerJoin(project, eq(project.id, environment.projectId))
    .innerJoin(organization, eq(organization.id, formSubmission.organizationId))
    .where(
      and(
        eq(formSubmission.id, row.submissionId),
        eq(formSubmission.organizationId, row.organizationId),
      ),
    )
    .limit(1);
  if (!found) return null;
  return {
    submission: found.submission,
    form: found.form,
    mode: found.mode,
    slugs: {
      organization: found.organizationSlug,
      project: found.projectSlug,
      environment: found.environmentSlug,
    },
  };
}

function environmentOf(loaded: Loaded) {
  return {
    organizationId: loaded.submission.organizationId,
    projectId: loaded.submission.projectId,
    environmentId: loaded.submission.environmentId,
    mode: loaded.mode,
  };
}

function firstValue(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed.slice(0, 256) : null;
}

/** The form's notification recipients still allowed to receive (live: members or verified domains). */
async function allowedRecipients(loaded: Loaded, deps: FormDeliveryDeps): Promise<string[]> {
  const { form: row } = loaded;
  if (environmentOf(loaded).mode === "sandbox") return row.notifyRecipients;
  const members = await memberAddresses(row.organizationId, row.notifyRecipients);
  const allowed: string[] = [];
  for (const address of row.notifyRecipients) {
    if (
      members.has(address) ||
      (await deps.verifiedAddress({ organizationId: row.organizationId, address }))
    ) {
      allowed.push(address);
    }
  }
  return allowed;
}

async function notify(loaded: Loaded, deps: FormDeliveryDeps): Promise<Outcome> {
  const { submission, form: row } = loaded;
  if (submission.status !== "accepted" || row.notifyRecipients.length === 0) return "skipped";
  // A member who left, or a domain that stopped being verified, gets no more submissions.
  const recipients = await allowedRecipients(loaded, deps);
  if (recipients.length === 0) return "skipped";
  const files = await db
    .select({ filename: formSubmissionFile.filename, size: formSubmissionFile.size })
    .from(formSubmissionFile)
    .where(
      and(
        eq(formSubmissionFile.submissionId, submission.id),
        eq(formSubmissionFile.organizationId, submission.organizationId),
      ),
    );
  const { slugs } = loaded;
  const submissionUrl =
    deps.dashboardUrl.replace(/\/+$/, "") +
    environmentHref(slugs, `/forms/${row.id}/submissions/${submission.id}`);
  const content = notificationContent({
    formName: row.name,
    fields: row.fields,
    data: submission.data,
    files,
    submissionUrl,
  });
  await deps.mailer.send({
    environment: environmentOf(loaded),
    from: row.notificationFrom,
    senderName: row.name,
    to: recipients,
    replyTo: submission.submitterEmail,
    ...content,
    idempotencyKey: `form-notification:${submission.id}`,
    customerOnly: false,
    category: "form_notification",
  });
  return "delivered";
}

async function addContact(loaded: Loaded, deps: FormDeliveryDeps): Promise<Outcome> {
  const { submission, form: row } = loaded;
  const contacts = contactsOf(row);
  if (submission.status !== "accepted" || !contacts.enabled || !submission.submitterEmail) {
    return "skipped";
  }
  const properties: Record<string, string> = {};
  for (const [key, field] of Object.entries(contacts.properties)) {
    const value = firstValue(submission.data[field]);
    if (value !== null) properties[key] = value;
  }
  await deps.contacts.add({
    environment: environmentOf(loaded),
    email: submission.submitterEmail,
    firstName: contacts.firstNameField
      ? firstValue(submission.data[contacts.firstNameField])
      : null,
    lastName: contacts.lastNameField ? firstValue(submission.data[contacts.lastNameField]) : null,
    properties,
    audienceIds: contacts.audienceIds,
    topics: contacts.topics,
    doubleOptIn: contacts.doubleOptIn,
  });
  return "delivered";
}

async function verify(
  loaded: Loaded,
  deps: FormDeliveryDeps,
  now: Date,
  claim: { deliveryId: string; attempts: number },
): Promise<Outcome> {
  const { submission, form: row } = loaded;
  if (submission.status !== "pending_confirmation" || !submission.submitterEmail) return "skipped";
  const admission = deps.admitVerification
    ? await deps.admitVerification({
        organizationId: submission.organizationId,
        address: submission.submitterEmail,
      })
    : { refund: async () => {} };
  if (!admission) return "skipped";
  // A fresh token per attempt (only its hash is stored): the key names it, so a retry after a
  // lost answer sends a working link rather than replaying one whose token was replaced. Stored
  // before the send, so an email that was queued always has a working link; a send that fails
  // puts the previous token back, so a failed retry never breaks a link already sent.
  const { token, hash } = mintConfirmationToken();
  if (
    !(await storeConfirmationToken(
      submission,
      hash,
      new Date(now.getTime() + FORM_CONFIRMATION_TTL_MS),
      claim,
    ))
  ) {
    // Confirmed meanwhile, or another worker took the delivery over.
    await admission.refund();
    return "skipped";
  }
  const confirmUrl = `${formEndpoint({ publicUrl: deps.formsUrl }, "c")}/${token}`;
  try {
    await deps.mailer.send({
      environment: environmentOf(loaded),
      from: row.confirmationFrom,
      senderName: row.name,
      to: [submission.submitterEmail],
      replyTo: null,
      ...verificationContent({ formName: row.name, confirmUrl }),
      idempotencyKey: `form-verification:${submission.id}:${hash.slice(0, 16)}`,
      customerOnly: true,
      category: "form_verification",
    });
  } catch (error) {
    // Nothing was queued: the retry pays again, so three failures don't spend the day's budget.
    await restoreConfirmationToken(submission, hash, {
      hash: submission.confirmationTokenHash,
      expiresAt: submission.confirmationExpiresAt,
    });
    await admission.refund();
    throw error;
  }
  return "delivered";
}

async function deliver(row: DeliveryRow, deps: FormDeliveryDeps, now: Date): Promise<void> {
  // Fenced on the claim: a worker whose lease ran out and was taken over (the next claim adds an
  // attempt) writes nothing over the newer attempt.
  const thisRow = and(
    eq(formDelivery.id, row.id),
    eq(formDelivery.organizationId, row.organizationId),
    eq(formDelivery.attempts, row.attempts),
  );
  try {
    const loaded = await load(row);
    const outcome: Outcome = !loaded
      ? "skipped"
      : row.kind === "notification"
        ? await notify(loaded, deps)
        : row.kind === "contact"
          ? await addContact(loaded, deps)
          : await verify(loaded, deps, now, { deliveryId: row.id, attempts: row.attempts });
    await db
      .update(formDelivery)
      .set({ state: outcome, deliveredAt: outcome === "delivered" ? now : null, lastError: null })
      .where(thisRow);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    console.error(`[forms] ${row.kind} delivery ${row.id} (${row.organizationId}) failed:`, error);
    await db
      .update(formDelivery)
      .set(
        row.attempts >= MAX_DELIVERY_ATTEMPTS
          ? { state: "failed", lastError: message }
          : {
              lastError: message,
              nextAttemptAt: new Date(
                now.getTime() + Math.min(60_000 * 2 ** (row.attempts - 1), MAX_BACKOFF_MS),
              ),
            },
      )
      .where(thisRow);
  }
}

/** Runs due deliveries, oldest first. Returns how many it claimed. */
export async function runDueFormDeliveries(
  opts: { now?: Date; limit?: number; scope?: { organizationIds: string[] } },
  deps: FormDeliveryDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  const due = and(eq(formDelivery.state, "pending"), lte(formDelivery.nextAttemptAt, now));
  // Checked again by each claim: an organization suspended mid-batch gets nothing more.
  const notSuspended = notExists(
    db
      .select({ id: organizationSuspension.organizationId })
      .from(organizationSuspension)
      .where(eq(organizationSuspension.organizationId, formDelivery.organizationId)),
  );
  const candidates = await db
    .select({ id: formDelivery.id })
    .from(formDelivery)
    .where(
      and(
        due,
        notSuspended,
        opts.scope ? inArray(formDelivery.organizationId, opts.scope.organizationIds) : undefined,
      ),
    )
    .orderBy(asc(formDelivery.nextAttemptAt))
    .limit(opts.limit ?? 50);
  let claimed = 0;
  const started = Date.now();
  for (const candidate of candidates) {
    // Each lease runs from its own claim: slow sends earlier in the batch never hand a later
    // row an expired lease another worker could take at once.
    const claimedAt = new Date(now.getTime() + (Date.now() - started));
    const [row] = await db
      .update(formDelivery)
      .set({
        attempts: sql`${formDelivery.attempts} + 1`,
        nextAttemptAt: new Date(claimedAt.getTime() + LEASE_MS),
      })
      .where(and(due, notSuspended, eq(formDelivery.id, candidate.id)))
      .returning();
    if (!row) continue;
    claimed += 1;
    await deliver(row, deps, claimedAt);
  }
  return claimed;
}
