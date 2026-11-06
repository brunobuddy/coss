"use server";

import { authorizeLiveSender } from "@coss/email";
import {
  createSignBuilderSession,
  deleteSignTemplate,
  requestSignReminders,
  SignError,
  updateSignSettings,
} from "@coss/sign";
import { SIGN_THEMES, type SignTheme } from "@coss/sign/schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { emailRuntime } from "@/lib/email-runtime";
import { type OrgContext, requireOrgPermission } from "@/lib/session";
import { signService, signUrl } from "@/lib/sign";

type SignPermission = "create" | "read" | "update" | "delete" | "send";

async function contextFor(formData: FormData, action: SignPermission) {
  return requireOrgPermission(formString(formData, "orgSlug"), { sign: [action] });
}

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return found.environment;
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

/** Sign's own errors carry messages fit for the member. */
async function signed<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SignError) throw new ActionError(error.message);
    throw error;
  }
}

export async function cancelSignRequestAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const environment = await environmentFromForm(context, formData);
    const requestId = formString(formData, "requestId");
    const request = await signed(() =>
      signService().cancel({
        organizationId: context.organization.id,
        environmentId: environment.id,
        requestId,
        actor: { kind: "dashboard" },
      }),
    );
    await audit(context, environment, "sign_request.canceled", {
      type: "sign_request",
      id: requestId,
      label: request.title,
    });
    refresh();
    return null;
  });
}

export async function remindSignRequestAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "send");
    const environment = await environmentFromForm(context, formData);
    await signed(() =>
      requestSignReminders({
        organizationId: context.organization.id,
        environmentId: environment.id,
        requestId: formString(formData, "requestId"),
      }),
    );
    refresh();
    return null;
  });
}

export async function deleteSignRequestAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "delete");
    const environment = await environmentFromForm(context, formData);
    const requestId = formString(formData, "requestId");
    await signed(() =>
      signService().deleteRequest({
        organizationId: context.organization.id,
        environmentId: environment.id,
        requestId,
      }),
    );
    await audit(context, environment, "sign_request.deleted", {
      type: "sign_request",
      id: requestId,
    });
    // Its page is gone: back to the list.
    redirect(
      `/${context.organization.slug}/${formString(formData, "projectSlug")}/${environment.slug}/sign`,
    );
  });
}

/** A new, empty template, and a builder link for it (opened in a new tab). */
export async function createSignTemplateAction(
  _previous: ActionResult<{ url: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "create");
    const environment = await environmentFromForm(context, formData);
    const name = formString(formData, "name").trim();
    if (!name) throw new ActionError("Name the template.");
    const url = signUrl();
    const template = await signed(() =>
      signService().createTemplate({
        environment: {
          organizationId: context.organization.id,
          projectId: environment.projectId,
          environmentId: environment.id,
          mode: environment.mode,
        },
        apiKeyId: null,
        params: { name: name.slice(0, 200), roles: [{ key: "signer", name: "Signer" }] },
      }),
    );
    await audit(context, environment, "sign_template.created", {
      type: "sign_template",
      id: template.id,
      label: template.name,
    });
    const session = await createSignBuilderSession({
      organizationId: context.organization.id,
      environmentId: environment.id,
      templateId: template.id,
      signUrl: url,
      userId: context.session.user.id,
    });
    refresh();
    return { url: session.url };
  });
}

/** A builder link for an existing template. */
export async function openSignBuilderAction(
  _previous: ActionResult<{ url: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const environment = await environmentFromForm(context, formData);
    const session = await signed(() =>
      createSignBuilderSession({
        organizationId: context.organization.id,
        environmentId: environment.id,
        templateId: formString(formData, "templateId"),
        signUrl: signUrl(),
        userId: context.session.user.id,
      }),
    );
    return { url: session.url };
  });
}

export async function deleteSignTemplateAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "delete");
    const environment = await environmentFromForm(context, formData);
    const templateId = formString(formData, "templateId");
    await signed(() =>
      deleteSignTemplate({
        organizationId: context.organization.id,
        environmentId: environment.id,
        templateId,
      }),
    );
    await audit(context, environment, "sign_template.deleted", {
      type: "sign_template",
      id: templateId,
    });
    refresh();
    return null;
  });
}

export async function saveSignSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const environment = await environmentFromForm(context, formData);
    const theme = formString(formData, "theme");
    if (!(SIGN_THEMES as readonly string[]).includes(theme))
      throw new ActionError("Choose a theme.");
    const accentColor = formString(formData, "accentColor").trim();
    if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      throw new ActionError("The accent color must look like #2563eb.");
    }
    const emailFrom = formString(formData, "emailFrom").trim();
    if (emailFrom && environment.mode === "live") {
      await authorizeLiveSender({
        organizationId: context.organization.id,
        from: emailFrom,
        provider: emailRuntime().domainDeps.identity.name,
      }).catch((error: unknown) => {
        throw new ActionError(
          error instanceof Error ? error.message : "That sender isn't verified.",
        );
      });
    }
    const interval = formString(formData, "reminderIntervalDays").trim();
    const reminderIntervalDays = interval ? Number(interval) : null;
    if (
      reminderIntervalDays !== null &&
      (!Number.isInteger(reminderIntervalDays) ||
        reminderIntervalDays < 1 ||
        reminderIntervalDays > 30)
    ) {
      throw new ActionError("Reminders go out every 1 to 30 days.");
    }
    const settings = await signed(() =>
      updateSignSettings({
        organizationId: context.organization.id,
        environmentId: environment.id,
        update: {
          allowed_origins: formString(formData, "allowedOrigins")
            .split(/[\s,]+/)
            .filter(Boolean),
          display_name: formString(formData, "displayName").trim() || null,
          accent_color: accentColor || null,
          theme: theme as SignTheme,
          email_from: emailFrom || null,
          reminder_interval_days: reminderIntervalDays,
          disclosure: formString(formData, "disclosure").trim() || null,
        },
      }),
    );
    await audit(
      context,
      environment,
      "sign_settings.updated",
      { type: "environment", id: environment.id, label: environment.name },
      { allowed_origins: settings.allowedOrigins, email_from: settings.emailFrom },
    );
    refresh();
    return null;
  });
}
