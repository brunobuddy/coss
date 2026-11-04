/**
 * Taking a submission (`POST <forms host>/f/<id>`). System-level: the organization comes from the
 * form. In order: the form must be accepting (enabled, not disabled by an admin, the organization
 * neither suspended nor being deleted), the post's origin allowed, its fields valid; then the
 * honeypot, then Risk (an assessment in the form's environment: email, IP, device, captcha,
 * velocity and the text). Files are stored before the row; one transaction stores the submission
 * and records what its status means (`record.ts`).
 */

import { createHash } from "node:crypto";
import type { UsageGate } from "@coss/billing/gate";
import { budgetHoldFor, isOnBillingHold } from "@coss/billing/metering";
import { db, schema } from "@coss/db";
import { ID_PREFIXES, isId, newId } from "@coss/db/id";
import { assessRisk, type RiskDeps } from "@coss/risk";
import { CreateRiskAssessmentRequest, MAX_CONTENT_TEXT_CHARS } from "@coss/risk/schemas";
import { and, eq, exists, sql } from "drizzle-orm";
import { type FormLinks, type FormRow, hostedOf } from "./forms.ts";
import { type FieldError, parseSubmission, type SubmittedFile, submissionText } from "./parse.ts";
import {
  type FormSubmissionRow,
  isUploadLimitError,
  isUsageLimitError,
  recordAccepted,
  recordFlagged,
  recordPendingConfirmation,
  type SubmissionContext,
} from "./record.ts";
import type { FormSpamReason, FormSubmissionStatus } from "./schemas.ts";
import { type FormFileStore, formFileKey } from "./store.ts";
import { discardStoreObjects } from "./store-cleanup.ts";

const {
  environment,
  form,
  formSubmission,
  formSubmissionFile,
  organizationDeletion,
  organizationSuspension,
} = schema;

export type SubmitFormInput = {
  formId: string;
  /** Name/value pairs as posted, in order. */
  fields: readonly [string, string][];
  files: readonly SubmittedFile[];
  ip: string | null;
  userAgent: string | null;
  /** The post's `Origin` header (else the `Referer`'s origin). */
  origin: string | null;
  referrer: string | null;
};

export type SubmitFormDeps = {
  riskDeps: RiskDeps;
  /** Where uploads go; `null`: forms refuse files (production without a bucket). */
  store: FormFileStore | null;
  links: FormLinks;
  /**
   * Charges the organization's submission budget once the form is known (`forms.submissions.day`);
   * false refuses the submission (`rate_limited`).
   */
  admit?: (form: { organizationId: string }) => Promise<boolean>;
  /** Capped plans' submission limit (`UsageGate`); without it, uncapped. */
  billing?: UsageGate;
  now?: Date;
};

/** What the submitter's browser is shown about the form (thank-you and error pages). */
export type SubmittedForm = {
  id: string;
  name: string;
  successMessage: string | null;
  /** Origins that may receive the browser after the post (`form-action` on pages). */
  allowedOrigins: string[];
  /** Accepted posts wait for the submitter's email link (spam must look the same). */
  verifySubmitter: boolean;
};

export type SubmitFormResult =
  /** Unknown, disabled, or its organization suspended, being deleted or on a billing hold. */
  | { outcome: "unavailable" }
  | { outcome: "origin_refused"; form: SubmittedForm }
  | { outcome: "rate_limited"; form: SubmittedForm }
  | { outcome: "invalid"; form: SubmittedForm; errors: FieldError[] }
  | {
      /** `spam` and `held` look like `accepted` to the submitter. */
      outcome: FormSubmissionStatus;
      form: SubmittedForm;
      submissionId: string;
      /** Where to send an HTML post's browser (303); `null`: the thank-you page. */
      redirect: string | null;
    };

type AcceptingForm = FormRow & { mode: "live" | "sandbox" };

async function acceptingForm(formId: string): Promise<AcceptingForm | null> {
  if (!isId(ID_PREFIXES.form, formId)) return null;
  const [row] = await db
    .select({ form, mode: environment.mode })
    .from(form)
    .innerJoin(
      environment,
      and(
        eq(environment.id, form.environmentId),
        eq(environment.organizationId, form.organizationId),
      ),
    )
    .where(
      and(
        eq(form.id, formId),
        eq(form.enabled, true),
        sql`${form.disabledByAdminAt} is null`,
        sql`not ${exists(
          db
            .select({ id: organizationSuspension.organizationId })
            .from(organizationSuspension)
            .where(eq(organizationSuspension.organizationId, form.organizationId)),
        )}`,
        sql`not ${exists(
          db
            .select({ id: organizationDeletion.id })
            .from(organizationDeletion)
            .where(
              and(
                eq(organizationDeletion.organizationId, form.organizationId),
                eq(organizationDeletion.status, "pending"),
              ),
            ),
        )}`,
      ),
    )
    .limit(1);
  return row ? { ...row.form, mode: row.mode } : null;
}

function originOf(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** `_next` is honored only toward an allowed origin (or any https URL when none are listed). */
function redirectFor(row: FormRow, next: string | null): string | null {
  if (next) {
    try {
      const url = new URL(next);
      const allowed =
        row.allowedOrigins.length > 0
          ? row.allowedOrigins.includes(url.origin)
          : url.protocol === "https:";
      if (allowed && !url.username && !url.password) return url.toString();
    } catch {
      // Not a URL: the form's own redirect applies.
    }
  }
  return row.redirectUrl;
}

type RiskOutcome = {
  assessmentId: string | null;
  decision: "allow" | "review" | "block" | null;
  score: number | null;
  /** The captcha's verdict: `null` when it couldn't be checked (no token, provider down, none set). */
  captchaPassed: boolean | null;
  /** The highest content score across categories; `null` when the text wasn't classified. */
  contentScore: number | null;
};

const NO_ASSESSMENT: RiskOutcome = {
  assessmentId: null,
  decision: null,
  score: null,
  captchaPassed: null,
  contentScore: null,
};

async function assess(
  deps: SubmitFormDeps,
  row: AcceptingForm,
  input: SubmitFormInput,
  parsed: ReturnType<typeof parseSubmission>,
): Promise<RiskOutcome> {
  const text = submissionText(row, parsed.data, MAX_CONTENT_TEXT_CHARS);
  const params = CreateRiskAssessmentRequest.safeParse({
    event: "custom",
    event_name: "form_submission",
    ...(parsed.submitterEmail ? { user: { email: parsed.submitterEmail } } : {}),
    ...(input.ip ? { ip: input.ip } : {}),
    ...(input.userAgent ? { user_agent: input.userAgent.slice(0, 1024) } : {}),
    ...(parsed.captchaToken ? { captcha: { token: parsed.captchaToken } } : {}),
    ...(parsed.deviceToken ? { device: { token: parsed.deviceToken } } : {}),
    ...(text ? { content: { text } } : {}),
  });
  if (!params.success) {
    console.error(`[forms] risk parameters for form ${row.id} didn't parse:`, params.error);
    return NO_ASSESSMENT;
  }
  try {
    const { assessment } = await assessRisk(deps.riskDeps, {
      environment: {
        organizationId: row.organizationId,
        projectId: row.projectId,
        environmentId: row.environmentId,
        mode: row.mode,
      },
      params: params.data,
    });
    return {
      assessmentId: assessment.id,
      decision: assessment.decision,
      score: assessment.score,
      captchaPassed: assessment.signals.captcha?.passed ?? null,
      contentScore: assessment.signals.content
        ? Math.max(...Object.values(assessment.signals.content))
        : null,
    };
  } catch (error) {
    // Risk fails open: the submission goes on without an assessment.
    console.error(`[forms] risk assessment for form ${row.id} failed:`, error);
    return NO_ASSESSMENT;
  }
}

function statusFor(
  row: FormRow,
  risk: RiskOutcome | null,
  honeypot: boolean,
): { status: FormSubmissionStatus; spamReason: FormSpamReason | null } {
  if (honeypot) return { status: "spam", spamReason: "honeypot" };
  if (risk?.decision === "block") return { status: "spam", spamReason: "risk_block" };
  if (
    row.contentThreshold !== null &&
    risk?.contentScore != null &&
    risk.contentScore >= row.contentThreshold
  ) {
    return { status: "spam", spamReason: "content" };
  }
  if (risk?.decision === "review" && row.onReview === "hold") {
    return { status: "held", spamReason: "risk_review" };
  }
  return { status: row.verifySubmitter ? "pending_confirmation" : "accepted", spamReason: null };
}

export async function submitForm(
  deps: SubmitFormDeps,
  input: SubmitFormInput,
): Promise<SubmitFormResult> {
  const row = await acceptingForm(input.formId);
  if (!row) return { outcome: "unavailable" };
  // A live submission is usage. The submitter sees what a closed form shows, nothing of the
  // customer's billing.
  if (
    row.mode === "live" &&
    ((await isOnBillingHold(row.organizationId)) ||
      (await budgetHoldFor({ organizationId: row.organizationId, projectId: row.projectId })))
  ) {
    return { outcome: "unavailable" };
  }
  const shown: SubmittedForm = {
    id: row.id,
    name: row.name,
    successMessage: hostedOf(row).successMessage,
    allowedOrigins: row.allowedOrigins,
    verifySubmitter: row.verifySubmitter,
  };
  const origin = originOf(input.origin) ?? originOf(input.referrer);
  // The hosted page posts from the forms host itself.
  const hostedOrigin = new URL(deps.links.publicUrl).origin;
  if (
    row.allowedOrigins.length > 0 &&
    (!origin || (!row.allowedOrigins.includes(origin) && origin !== hostedOrigin))
  ) {
    return { outcome: "origin_refused", form: shown };
  }
  if (deps.admit && !(await deps.admit(row))) return { outcome: "rate_limited", form: shown };

  const parsed = parseSubmission(row, input.fields, input.files);
  // A bot that filled the honeypot gets no hints about what else was wrong.
  if (!parsed.honeypot) {
    if (row.captcha === "required" && !parsed.captchaToken) {
      parsed.errors.push({
        field: null,
        code: "captcha",
        message: "Complete the captcha to submit the form.",
      });
    }
    if (row.verifySubmitter && !parsed.submitterEmail) {
      if (!parsed.errors.some((error) => error.field === row.emailField)) {
        parsed.errors.push({
          field: row.emailField,
          code: "required",
          message: "Enter your email address: you'll get a link to confirm it.",
        });
      }
    }
    if (parsed.files.length > 0 && !deps.store) {
      parsed.errors.push({
        field: parsed.files[0]?.field ?? null,
        code: "files_not_accepted",
        message: "This form can't take files right now.",
      });
    }
    if (parsed.errors.length > 0) return { outcome: "invalid", form: shown, errors: parsed.errors };
  }

  const risk = parsed.honeypot ? null : await assess(deps, row, input, parsed);
  // A required captcha must pass: one that couldn't be checked (the provider timed out, the
  // assessment failed, the environment's captcha was removed) refuses rather than lets bots in.
  if (risk && row.captcha === "required" && risk.captchaPassed !== true) {
    return {
      outcome: "invalid",
      form: shown,
      errors: [
        {
          field: null,
          code: "captcha",
          message:
            risk.captchaPassed === false
              ? "The captcha failed. Try again."
              : "The captcha couldn't be checked. Try again in a moment.",
        },
      ],
    };
  }
  const { status, spamReason } = statusFor(row, risk, parsed.honeypot);
  const now = deps.now ?? new Date();
  const submissionId = newId(ID_PREFIXES.formSubmission);

  // Files first (a honeypot catch keeps none): the row must never point at missing bytes.
  const files = parsed.honeypot
    ? []
    : parsed.files.map((file) => {
        const id = newId(ID_PREFIXES.formSubmissionFile);
        return {
          ...file,
          id,
          key: formFileKey({
            organizationId: row.organizationId,
            environmentId: row.environmentId,
            formId: row.id,
            submissionId,
            fileId: id,
          }),
        };
      });
  if (files.length > 0 && deps.store) {
    const store = deps.store;
    try {
      for (const file of files) {
        await store.put({
          key: file.key,
          organizationId: row.organizationId,
          contentType: file.contentType,
          content: file.content,
        });
      }
    } catch (error) {
      await discardStoreObjects(
        store,
        row.organizationId,
        files.map((file) => file.key),
      );
      throw error;
    }
  }

  const context: SubmissionContext = {
    form: row,
    sandbox: row.mode === "sandbox",
    billing: deps.billing,
  };
  try {
    await db.transaction(async (tx) => {
      const [submission] = await tx
        .insert(formSubmission)
        .values({
          id: submissionId,
          organizationId: row.organizationId,
          projectId: row.projectId,
          environmentId: row.environmentId,
          formId: row.id,
          status,
          // A honeypot catch skips validation (no hints for bots): one over the limits keeps
          // nothing it sent, so the honeypot is never a way around them.
          data: parsed.honeypot && parsed.errors.length > 0 ? {} : parsed.data,
          submitterEmail: parsed.submitterEmail,
          ip: input.ip,
          userAgent: input.userAgent?.slice(0, 1024) ?? null,
          origin,
          referrer: input.referrer?.slice(0, 2048) ?? null,
          riskAssessmentId: risk?.assessmentId ?? null,
          riskDecision: risk?.decision ?? null,
          riskScore: risk?.score ?? null,
          spamReason,
          acceptedAt: status === "accepted" ? now : null,
          createdAt: now,
        })
        .returning();
      if (files.length > 0) {
        await tx.insert(formSubmissionFile).values(
          files.map((file) => ({
            id: file.id,
            organizationId: row.organizationId,
            submissionId,
            field: file.field,
            filename: file.filename,
            contentType: file.contentType,
            size: file.content.byteLength,
            storeKey: file.key,
            sha256: createHash("sha256").update(file.content).digest("hex"),
          })),
        );
      }
      const stored = submission as FormSubmissionRow;
      if (status === "accepted") await recordAccepted(tx, context, stored, { occurredAt: now });
      else if (status === "pending_confirmation") {
        await recordPendingConfirmation(tx, context, stored, { occurredAt: now });
      } else await recordFlagged(tx, context, stored, { occurredAt: now });
    });
  } catch (error) {
    if (deps.store && files.length > 0) {
      await discardStoreObjects(
        deps.store,
        row.organizationId,
        files.map((file) => file.key),
      );
    }
    // The plan's uploads for the period are used up: the form still takes posts without files.
    if (isUploadLimitError(error)) {
      return {
        outcome: "invalid",
        form: shown,
        errors: [
          {
            field: files[0]?.field ?? null,
            code: "files_not_accepted",
            message: "This form can't take files right now. Send it without them.",
          },
        ],
      };
    }
    // The plan's submissions for the period are used up: the form takes none until it resets.
    if (isUsageLimitError(error)) return { outcome: "unavailable" };
    throw error;
  }
  return { outcome: status, form: shown, submissionId, redirect: redirectFor(row, parsed.next) };
}
