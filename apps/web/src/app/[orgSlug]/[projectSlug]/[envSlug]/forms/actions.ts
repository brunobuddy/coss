"use server";

import {
  createForm,
  deleteForm,
  deleteFormSubmission,
  getFormSubmissionRow,
  releaseSubmission,
  updateForm,
} from "@coss/forms";
import {
  CreateFormRequest,
  FORM_CAPTCHA_MODES,
  FORM_ON_REVIEW,
  FormFieldInput,
  UpdateFormRequest,
  type UpdateFormRequestOutput,
} from "@coss/forms/schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { usageGate } from "@/lib/broadcasts";
import { formChecks, formLinks, formsStore } from "@/lib/forms";
import { riskHasher } from "@/lib/risk";
import { type OrgContext, requireOrgPermission } from "@/lib/session";

type FormPermission = "create" | "read" | "update" | "delete";

async function contextFor(formData: FormData, action: FormPermission) {
  return requireOrgPermission(formString(formData, "orgSlug"), { form: [action] });
}

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  const { environment, project } = found;
  return {
    environment,
    project,
    scope: {
      organizationId: context.organization.id,
      projectId: environment.projectId,
      environmentId: environment.id,
      mode: environment.mode,
    },
    path: `/${context.organization.slug}/${project.slug}/${environment.slug}/forms`,
  };
}

function audit(
  context: OrgContext,
  environment: { id: string; projectId: string },
  action: string,
  target: { type: string; id: string | null; label?: string | null },
  metadata?: Record<string, unknown>,
) {
  return recordAudit(context.session, {
    organizationId: context.organization.id,
    action,
    target,
    projectId: environment.projectId,
    environmentId: environment.id,
    metadata,
  });
}

/** The first validation problem, worded for the member. */
function parsed<T>(result: z.ZodSafeParseResult<T>): T {
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.join(".");
  throw new ActionError(
    where ? `${where}: ${issue?.message}` : (issue?.message ?? "Invalid form."),
  );
}

function lines(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function optional(value: string): string | null {
  return value === "" ? null : value;
}

export async function createFormAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "create");
    const { environment, scope, path } = await environmentFromForm(context, formData);
    const params = parsed(CreateFormRequest.safeParse({ name: formString(formData, "name") }));
    const form = await createForm(scope, params, { links: formLinks(), checks: formChecks() });
    await audit(context, environment, "form.created", {
      type: "form",
      id: form.id,
      label: form.name,
    });
    redirect(`${path}/${form.id}/builder`);
  });
}

/** The settings page's fields as an update (everything but fields and the hosted page). */
function settingsUpdate(formData: FormData): UpdateFormRequestOutput {
  const captcha = formString(formData, "captcha");
  const onReview = formString(formData, "onReview");
  const threshold = formString(formData, "contentThreshold");
  const doubleOptIn = formString(formData, "doubleOptIn");
  const maxFileMb = formString(formData, "maxFileMb");
  return parsed(
    UpdateFormRequest.safeParse({
      name: formString(formData, "name"),
      enabled: formData.get("enabled") === "on",
      strict_fields: formData.get("strictFields") === "on",
      allowed_origins: lines(formString(formData, "allowedOrigins")),
      redirect_url: optional(formString(formData, "redirectUrl")),
      spam: {
        honeypot_field: formString(formData, "honeypotField") || "_gotcha",
        captcha: (FORM_CAPTCHA_MODES as readonly string[]).includes(captcha) ? captcha : "off",
        captcha_site_key: optional(formString(formData, "captchaSiteKey")),
        content_threshold: threshold === "" ? null : Number(threshold),
        on_review: (FORM_ON_REVIEW as readonly string[]).includes(onReview) ? onReview : "hold",
      },
      submitter: {
        email_field: formString(formData, "emailField") || "email",
        verify: formData.get("verify") === "on",
        confirmation_from: optional(formString(formData, "confirmationFrom")),
      },
      notifications: {
        recipients: lines(formString(formData, "recipients")),
        from: optional(formString(formData, "notificationFrom")),
      },
      contacts: {
        enabled: formData.get("contactsEnabled") === "on",
        audience_ids: formData.getAll("audienceIds").filter((id) => typeof id === "string"),
        topics: formData.getAll("topics").filter((key) => typeof key === "string"),
        double_opt_in: doubleOptIn === "on" ? true : doubleOptIn === "off" ? false : null,
        first_name_field: optional(formString(formData, "firstNameField")),
        last_name_field: optional(formString(formData, "lastNameField")),
      },
      files: {
        enabled: formData.get("filesEnabled") === "on",
        max_files: Number(formString(formData, "maxFiles") || "3"),
        ...(maxFileMb && maxFileMb !== formString(formData, "maxFileMbShown")
          ? { max_file_bytes: Math.max(1, Math.round(Number(maxFileMb) * 1024 * 1024)) }
          : {}),
        allowed_types: lines(formString(formData, "allowedTypes")),
      },
    }),
  );
}

export async function saveFormSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const { environment, scope } = await environmentFromForm(context, formData);
    const formId = formString(formData, "formId");
    const update = settingsUpdate(formData);
    const form = await updateForm(scope, formId, update, {
      links: formLinks(),
      checks: formChecks(),
    });
    await audit(
      context,
      environment,
      "form.updated",
      { type: "form", id: form.id, label: form.name },
      { fields: Object.keys(update) },
    );
    refresh();
    return null;
  });
}

const FieldsInput = z.array(FormFieldInput);

/** The builder: the form's fields (JSON from the editor) and its hosted page. */
export async function saveFormFieldsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const { environment, scope } = await environmentFromForm(context, formData);
    const formId = formString(formData, "formId");
    let raw: unknown;
    try {
      raw = JSON.parse(formString(formData, "fields") || "[]");
    } catch {
      throw new ActionError("The fields couldn't be read. Reload the page and try again.");
    }
    const fields = parsed(FieldsInput.safeParse(raw));
    const update = parsed(
      UpdateFormRequest.safeParse({
        fields: fields.length > 0 ? fields : null,
        hosted: {
          enabled: formData.get("hostedEnabled") === "on",
          title: optional(formString(formData, "title")),
          description: optional(formString(formData, "description")),
          submit_label: optional(formString(formData, "submitLabel")),
          success_message: optional(formString(formData, "successMessage")),
        },
      }),
    );
    const form = await updateForm(scope, formId, update, {
      links: formLinks(),
      checks: formChecks(),
    });
    await audit(
      context,
      environment,
      "form.updated",
      { type: "form", id: form.id, label: form.name },
      { fields: ["fields", "hosted"], hosted: form.hosted.enabled },
    );
    refresh();
    return null;
  });
}

export async function deleteFormAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "delete");
    const { environment, path } = await environmentFromForm(context, formData);
    const formId = formString(formData, "formId");
    await deleteForm(
      { organizationId: context.organization.id, environmentId: environment.id, formId },
      formsStore(),
    );
    await audit(context, environment, "form.deleted", { type: "form", id: formId });
    // Its pages are gone: back to the list.
    redirect(path);
  });
}

async function submissionTarget(context: OrgContext, formData: FormData) {
  const { environment, path } = await environmentFromForm(context, formData);
  const scope = {
    organizationId: context.organization.id,
    environmentId: environment.id,
    formId: formString(formData, "formId"),
    submissionId: formString(formData, "submissionId"),
  };
  // The submission must be the form's, in this environment.
  if (!(await getFormSubmissionRow(scope))) throw new ActionError("Submission not found.");
  return { environment, scope, formPath: `${path}/${scope.formId}` };
}

export async function releaseSubmissionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const { environment, scope } = await submissionTarget(context, formData);
    await releaseSubmission(scope, {
      actor: { kind: "user", userId: context.session.user.id },
      riskHash: riskHasher(),
      billing: await usageGate(),
    });
    await audit(
      context,
      environment,
      "form_submission.released",
      { type: "form_submission", id: scope.submissionId },
      { form_id: scope.formId },
    );
    refresh();
    return null;
  });
}

export async function deleteSubmissionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "delete");
    const { environment, scope, formPath } = await submissionTarget(context, formData);
    await deleteFormSubmission(scope, formsStore());
    await audit(
      context,
      environment,
      "form_submission.deleted",
      { type: "form_submission", id: scope.submissionId },
      { form_id: scope.formId },
    );
    redirect(formPath);
  });
}
