"use server";

import { cancelScheduledEmail, rescheduleEmail } from "@coss/email";
import { RescheduleEmailRequest } from "@coss/email/schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { requireOrgPermission } from "@/lib/session";

/** Cancels a scheduled email of the environment addressed by the form's slugs. */
export async function cancelEmailAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      email: ["send"],
    });
    const found = await getEnvironment({
      organizationId: context.organization.id,
      projectSlug: formString(formData, "projectSlug"),
      envSlug: formString(formData, "envSlug"),
    });
    if (!found) throw new ActionError("Environment not found.");
    // Scoped to this environment (and so this organization): other emails are "not found".
    const emailId = formString(formData, "emailId");
    await cancelScheduledEmail({
      organizationId: context.organization.id,
      environmentId: found.environment.id,
      emailId,
    });
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "email.canceled",
      target: { type: "email", id: emailId },
      projectId: found.project.id,
      environmentId: found.environment.id,
    });
    refresh();
    return null;
  });
}

/** `datetime-local` input values, read as UTC (the dashboard shows every time in UTC). */
const UTC_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Moves a scheduled email of the environment addressed by the form's slugs to a new time. */
export async function rescheduleEmailAction(
  _previous: ActionResult<{ scheduledAt: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ scheduledAt: string }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      email: ["send"],
    });
    const local = formString(formData, "scheduledAt");
    if (!UTC_MINUTE.test(local)) throw new ActionError("Choose a date and time.");
    const parsed = RescheduleEmailRequest.safeParse({ scheduled_at: `${local}:00Z` });
    if (!parsed.success) {
      throw new ActionError(parsed.error.issues[0]?.message ?? "Choose a valid date and time.");
    }
    const found = await getEnvironment({
      organizationId: context.organization.id,
      projectSlug: formString(formData, "projectSlug"),
      envSlug: formString(formData, "envSlug"),
    });
    if (!found) throw new ActionError("Environment not found.");
    // Scoped to this environment (and so this organization): other emails are "not found".
    const email = await rescheduleEmail({
      organizationId: context.organization.id,
      environmentId: found.environment.id,
      emailId: formString(formData, "emailId"),
      scheduledAt: parsed.data.scheduled_at,
    });
    // The same event the API's reschedule records.
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "email.rescheduled",
      target: { type: "email", id: email.id },
      projectId: found.project.id,
      environmentId: found.environment.id,
      metadata: { scheduled_at: email.scheduled_at },
    });
    refresh();
    return { scheduledAt: email.scheduled_at ?? parsed.data.scheduled_at };
  });
}
