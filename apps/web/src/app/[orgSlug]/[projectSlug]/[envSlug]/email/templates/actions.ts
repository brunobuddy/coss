"use server";

import {
  createEmailTemplate,
  deleteEmailTemplate,
  EmailError,
  getTemplateDraft,
  publishTemplateDraft,
  restoreTemplateVersion,
  saveTemplateDraft,
  updateEmailTemplate,
} from "@coss/email";
import {
  CreateEmailTemplateRequest,
  SendEmailRequest,
  UpdateEmailTemplateDraftRequest,
  UpdateEmailTemplateRequest,
} from "@coss/email/schemas";
import { emailSendQuota } from "@coss/ratelimit";
import { getEnvironment, listVerifiedMemberEmails } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { emailService } from "@/lib/email-service";
import { environmentPath } from "@/lib/navigation";
import { rateLimitRuntime } from "@/lib/rate-limit-runtime";
import { type OrgContext, requireOrgPermission } from "@/lib/session";

/** Test sends go to at most this many members at once. */
const MAX_TEST_RECIPIENTS = 5;

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  const { project, environment } = found;
  return {
    scope: { organizationId: context.organization.id, environmentId: environment.id },
    project,
    environment,
    base: environmentPath(context.organization.slug, project.slug, environment.slug),
  };
}

type FoundEnvironment = Awaited<ReturnType<typeof environmentFromForm>>;

function audit(
  context: OrgContext,
  env: FoundEnvironment,
  action: string,
  template: { id: string; name: string },
  metadata?: Record<string, unknown>,
) {
  return recordAudit(context.session, {
    organizationId: env.scope.organizationId,
    projectId: env.project.id,
    environmentId: env.scope.environmentId,
    action,
    target: { type: "email_template", id: template.id, label: template.name },
    metadata,
  });
}

/** The first validation issue, as "path: message". */
function issueMessage(error: z.ZodError): string {
  const [issue] = error.issues;
  if (!issue) return "Invalid input.";
  return issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

function jsonField(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(formString(formData, name) || "{}");
  } catch {
    throw new ActionError(`The ${name} could not be read. Reload the page and try again.`);
  }
}

/** A new template starts with one variable and an English draft to edit. */
const STARTER_DRAFT = {
  variables: [{ name: "first_name", type: "string", required: true }],
  sample_variables: { first_name: "Ada" },
  contents: [
    {
      locale: "en",
      subject: "Hello {{first_name}}",
      html: "<p>Hi {{first_name}},</p>\n<p>…</p>",
      text: "Hi {{first_name}},\n\n…",
    },
  ],
};

export async function createTemplateAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      emailTemplate: ["create"],
    });
    const env = await environmentFromForm(context, formData);
    const parsed = CreateEmailTemplateRequest.safeParse({
      name: formString(formData, "name"),
      alias: formString(formData, "alias") || undefined,
      ...STARTER_DRAFT,
    });
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
    const template = await createEmailTemplate(env.scope, parsed.data);
    await audit(context, env, "email_template.created", template);
    return `${env.base}/email/templates/${template.id}`;
  });
  if (result.ok) redirect(result.data);
  return result;
}

export async function updateTemplateAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      emailTemplate: ["update"],
    });
    const env = await environmentFromForm(context, formData);
    const parsed = UpdateEmailTemplateRequest.safeParse({
      name: formString(formData, "name"),
      alias: formString(formData, "alias") || null,
      description: formString(formData, "description") || null,
    });
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
    const template = await updateEmailTemplate(
      env.scope,
      formString(formData, "templateId"),
      parsed.data,
    );
    await audit(context, env, "email_template.updated", template, {
      fields: Object.keys(parsed.data),
    });
    refresh();
    return null;
  });
}

export async function deleteTemplateAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      emailTemplate: ["delete"],
    });
    const env = await environmentFromForm(context, formData);
    const { template } = await getTemplateDraft(env.scope, formString(formData, "templateId"));
    await deleteEmailTemplate(env.scope, template.id);
    await audit(context, env, "email_template.deleted", template);
    return `${env.base}/email/templates`;
  });
  if (result.ok) redirect(result.data);
  return result;
}

/** Saves the editor's draft; returns its new revision. */
export async function saveDraftAction(
  _previous: ActionResult<{ revision: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ revision: number }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      emailTemplate: ["update"],
    });
    const env = await environmentFromForm(context, formData);
    const parsed = UpdateEmailTemplateDraftRequest.safeParse(jsonField(formData, "draft"));
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
    const { template, draft } = await saveTemplateDraft(
      env.scope,
      formString(formData, "templateId"),
      parsed.data,
    );
    await audit(context, env, "email_template.draft_saved", template, {
      revision: draft.revision,
    });
    refresh();
    return { revision: draft.revision };
  });
}

export async function publishTemplateAction(
  _previous: ActionResult<{ version: number | null }> | null,
  formData: FormData,
): Promise<ActionResult<{ version: number | null }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      emailTemplate: ["publish"],
    });
    const env = await environmentFromForm(context, formData);
    const revision = Number(formString(formData, "revision"));
    const { template, version, published } = await publishTemplateDraft(
      env.scope,
      formString(formData, "templateId"),
      // Publishes exactly what the editor showed: refused if someone saved since.
      { revision: Number.isInteger(revision) && revision > 0 ? revision : undefined },
    );
    if (published) {
      await audit(context, env, "email_template.published", template, {
        version: version.version,
      });
    }
    refresh();
    return { version: version.version };
  });
}

export async function restoreVersionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      emailTemplate: ["update"],
    });
    const env = await environmentFromForm(context, formData);
    const version = Number(formString(formData, "version"));
    if (!Number.isInteger(version) || version < 1) throw new ActionError("Choose a version.");
    const { template } = await restoreTemplateVersion(
      env.scope,
      formString(formData, "templateId"),
      version,
    );
    await audit(context, env, "email_template.version_restored", template, { version });
    return `${env.base}/email/templates/${template.id}`;
  });
  if (result.ok) redirect(result.data);
  return result;
}

/**
 * Sends the saved draft, rendered with the sample values, to members of the organization. Charged
 * to the environment's send quota like any send; live environments need a verified sender.
 */
export async function sendTestAction(
  _previous: ActionResult<{ emailId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ emailId: string }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      email: ["send"],
      emailTemplate: ["read"],
    });
    const env = await environmentFromForm(context, formData);
    const { template, draft } = await getTemplateDraft(
      env.scope,
      formString(formData, "templateId"),
    );
    if (draft.revision !== Number(formString(formData, "revision"))) {
      throw new ActionError("Save the draft before sending a test.");
    }

    const recipients = [
      ...new Set(
        formData
          .getAll("to")
          .filter((value): value is string => typeof value === "string" && value !== ""),
      ),
    ];
    if (recipients.length === 0) throw new ActionError("Choose at least one recipient.");
    if (recipients.length > MAX_TEST_RECIPIENTS) {
      throw new ActionError(`Test sends go to at most ${MAX_TEST_RECIPIENTS} recipients.`);
    }
    // Only the organization's own (verified) members: the dashboard is no way to email anyone.
    const allowed = new Set(
      (await listVerifiedMemberEmails({ organizationId: env.scope.organizationId })).map(
        (address) => address.toLowerCase(),
      ),
    );
    if (recipients.some((address) => !allowed.has(address.toLowerCase()))) {
      throw new ActionError("Test sends can only go to verified members of this organization.");
    }

    const parsed = SendEmailRequest.safeParse({
      from: formString(formData, "from"),
      to: recipients,
      template_id: draft.templateId,
      locale: formString(formData, "locale") || undefined,
      variables: jsonField(formData, "variables"),
    });
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));

    const environment = {
      organizationId: env.scope.organizationId,
      projectId: env.project.id,
      environmentId: env.scope.environmentId,
      mode: env.environment.mode,
    };
    const { limiter } = rateLimitRuntime();
    const quota = emailSendQuota(environment, recipients.length);
    const decision = await limiter.consume(quota);
    if (!decision.allowed) {
      throw new ActionError("The environment's send quota is used up for now. Try again later.");
    }
    let emailId: string;
    try {
      const service = await emailService();
      const { email } = await service.send({
        environment,
        apiKeyId: null,
        params: parsed.data,
        templateDraft: { revision: draft.revision },
      });
      emailId = email.id;
    } catch (error) {
      await limiter.refund(quota);
      if (error instanceof EmailError && error.code === "template_revision_mismatch") {
        throw new ActionError(
          "The draft was changed by someone else. Reload it, then send a test.",
        );
      }
      throw error;
    }
    await audit(context, env, "email_template.test_sent", template, {
      email_id: emailId,
      recipients: recipients.length,
    });
    refresh();
    return { emailId };
  });
}
