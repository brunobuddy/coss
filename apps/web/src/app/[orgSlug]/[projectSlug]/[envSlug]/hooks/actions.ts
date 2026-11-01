"use server";

import {
  createHookApplication,
  createHookEndpoint,
  createHookEventType,
  createHookPortalSession,
  deleteHookApplication,
  deleteHookEndpoint,
  findHookApplication,
  getHookEndpoint,
  getHookEventType,
  type HookApplicationRow,
  type HookEndpointRow,
  portalSessionUrl,
  recoverHookEndpoint,
  retryHookDelivery,
  revealHookEndpointSecret,
  rollHookEndpointSecret,
  sendHookMessage,
  setHookPortalSettings,
  updateHookEndpoint,
  updateHookEventType,
} from "@coss/hooks";
import { PORTAL_THEMES, type PortalTheme } from "@coss/hooks/schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { hookManagementDeps, portalUrl } from "@/lib/hooks";
import { type OrgContext, requireOrgPermission } from "@/lib/session";
import { RECOVER_SINCE_OPTIONS } from "../developers/webhooks/recover";
import { PREVIOUS_SECRET_OPTIONS } from "../developers/webhooks/secret-roll";

type HookPermission = "create" | "read" | "update" | "delete" | "send";

async function contextFor(formData: FormData, action: HookPermission) {
  return requireOrgPermission(formString(formData, "orgSlug"), { hook: [action] });
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

/** The application addressed by the form, checked to belong to that environment. */
async function applicationFromForm(
  context: OrgContext,
  formData: FormData,
): Promise<HookApplicationRow> {
  const environment = await environmentFromForm(context, formData);
  const application = await findHookApplication({
    organizationId: context.organization.id,
    environmentId: environment.id,
    ref: formString(formData, "applicationId"),
  });
  if (!application) throw new ActionError("Application not found.");
  return application;
}

/** The endpoint addressed by the form, checked to belong to that application. */
async function endpointFromForm(context: OrgContext, formData: FormData) {
  const application = await applicationFromForm(context, formData);
  const endpoint = await getHookEndpoint({
    organizationId: context.organization.id,
    applicationId: application.id,
    id: formString(formData, "endpointId"),
  });
  if (!endpoint) throw new ActionError("Endpoint not found.");
  return { application, endpoint };
}

function audit(
  context: OrgContext,
  scope: { projectId: string; environmentId: string },
  action: string,
  target: { type: string; id: string | null; label?: string | null },
  metadata?: Record<string, unknown>,
) {
  return recordAudit(context.session, {
    organizationId: context.organization.id,
    action,
    target,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    metadata,
  });
}

const scopeOf = (environment: { id: string; projectId: string }) => ({
  projectId: environment.projectId,
  environmentId: environment.id,
});

const endpointTarget = (endpoint: HookEndpointRow) => ({
  type: "hook_endpoint",
  id: endpoint.id,
  label: endpoint.url,
});

export async function createHookApplicationAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "create");
    const environment = await environmentFromForm(context, formData);
    const name = formString(formData, "name");
    if (!name) throw new ActionError("Enter a name.");
    const application = await createHookApplication({
      organizationId: context.organization.id,
      environmentId: environment.id,
      name,
      uid: formString(formData, "uid") || null,
    });
    await audit(context, application, "hook_application.created", {
      type: "hook_application",
      id: application.id,
      label: application.uid ?? application.name,
    });
    refresh();
    return { id: application.id };
  });
}

export async function deleteHookApplicationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const context = await contextFor(formData, "delete");
    const application = await applicationFromForm(context, formData);
    await deleteHookApplication({ organizationId: context.organization.id, id: application.id });
    await audit(context, application, "hook_application.deleted", {
      type: "hook_application",
      id: application.id,
      label: application.uid ?? application.name,
    });
    return null;
  });
  if (!result.ok) return result;
  redirect(
    `/${formString(formData, "orgSlug")}/${formString(formData, "projectSlug")}/${formString(formData, "envSlug")}/hooks`,
  );
}

/** Signs in to the application's portal: a short-lived session minted for the signed-in member. */
export async function openHookPortalAction(
  _previous: ActionResult<{ url: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const application = await applicationFromForm(context, formData);
    const { session, token } = await createHookPortalSession({
      application,
      expiresIn: 60 * 60,
      userId: context.session.user.id,
    });
    await audit(
      context,
      application,
      "hook_portal_session.created",
      { type: "hook_application", id: application.id, label: application.uid ?? application.name },
      { session_id: session.id },
    );
    return { url: portalSessionUrl(portalUrl(), session.id, token) };
  });
}

export async function createHookEndpointAction(
  _previous: ActionResult<{ id: string; secret: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; secret: string }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "create");
    const application = await applicationFromForm(context, formData);
    const filterTypes = formData
      .getAll("filterTypes")
      .filter((value): value is string => typeof value === "string" && value !== "");
    const { endpoint, secret } = await createHookEndpoint(
      {
        organizationId: context.organization.id,
        environmentId: application.environmentId,
        applicationId: application.id,
        url: formString(formData, "url"),
        description: formString(formData, "description"),
        filterTypes,
      },
      hookManagementDeps(),
    );
    await audit(context, application, "hook_endpoint.created", endpointTarget(endpoint), {
      application_id: application.id,
    });
    refresh();
    return { id: endpoint.id, secret };
  });
}

export async function setHookEndpointEnabledAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const { application, endpoint } = await endpointFromForm(context, formData);
    const enabled = formString(formData, "enabled") === "true";
    await updateHookEndpoint(
      {
        organizationId: context.organization.id,
        environmentId: application.environmentId,
        applicationId: application.id,
        id: endpoint.id,
        enabled,
      },
      hookManagementDeps(),
    );
    await audit(context, application, "hook_endpoint.updated", endpointTarget(endpoint), {
      enabled,
    });
    refresh();
    return null;
  });
}

export async function deleteHookEndpointAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const context = await contextFor(formData, "delete");
    const { application, endpoint } = await endpointFromForm(context, formData);
    await deleteHookEndpoint({
      organizationId: context.organization.id,
      applicationId: application.id,
      id: endpoint.id,
    });
    await audit(context, application, "hook_endpoint.deleted", endpointTarget(endpoint));
    return null;
  });
  if (!result.ok) return result;
  redirect(
    `/${formString(formData, "orgSlug")}/${formString(formData, "projectSlug")}/${formString(formData, "envSlug")}/hooks/${formString(formData, "applicationId")}`,
  );
}

/** Reveals the endpoint's signing secret (needs `hook:update`, like rolling it). */
export async function revealHookEndpointSecretAction(
  _previous: ActionResult<{ secret: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ secret: string }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const { endpoint } = await endpointFromForm(context, formData);
    return { secret: revealHookEndpointSecret(endpoint, hookManagementDeps()) };
  });
}

export async function rollHookEndpointSecretAction(
  _previous: ActionResult<{ secret: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ secret: string }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const { application, endpoint } = await endpointFromForm(context, formData);
    const chosen = formString(formData, "previousSecretExpiresIn");
    const option = PREVIOUS_SECRET_OPTIONS.find(({ seconds }) => String(seconds) === chosen);
    if (!option) throw new ActionError("Choose when the current secret stops signing.");
    const { secret } = await rollHookEndpointSecret(
      {
        organizationId: context.organization.id,
        applicationId: application.id,
        id: endpoint.id,
        previousSecretExpiresIn: option.seconds,
      },
      hookManagementDeps(),
    );
    await audit(context, application, "hook_endpoint.secret_rolled", endpointTarget(endpoint));
    refresh();
    return { secret };
  });
}

/** Starts a recovery of the endpoint's failed deliveries within the chosen period. */
export async function recoverHookEndpointAction(
  _previous: ActionResult<{ requeued: number; hasMore: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ requeued: number; hasMore: boolean }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const { application, endpoint } = await endpointFromForm(context, formData);
    const chosen = formString(formData, "sinceHours");
    const option = RECOVER_SINCE_OPTIONS.find(({ hours }) => String(hours) === chosen);
    if (!option) throw new ActionError("Choose how far back to recover.");
    const since = new Date(Date.now() - option.hours * 3_600_000);
    const recovery = await recoverHookEndpoint({ endpoint, since });
    await audit(context, application, "hook_endpoint.recovered", endpointTarget(endpoint), {
      since: since.toISOString(),
      recovery_id: recovery.id,
    });
    refresh();
    // Requeued in the background: the count is shown as it grows on the endpoint's page.
    return { requeued: recovery.requeued, hasMore: true };
  });
}

/** Sends a test message (the event type's first example) to this endpoint only. */
export async function sendHookTestAction(
  _previous: ActionResult<{ messageId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ messageId: string }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "send");
    const { application, endpoint } = await endpointFromForm(context, formData);
    const eventType = formString(formData, "eventType");
    if (!eventType) throw new ActionError("Choose an event type.");
    const type = await getHookEventType({
      organizationId: context.organization.id,
      environmentId: application.environmentId,
      name: eventType,
    });
    const payload = (type?.examples[0] as Record<string, unknown> | undefined) ?? {};
    const { message } = await sendHookMessage({
      application,
      eventType,
      payload,
      onlyEndpointId: endpoint.id,
    });
    refresh();
    return { messageId: message.id };
  });
}

export async function retryHookDeliveryAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const application = await applicationFromForm(context, formData);
    const delivery = await retryHookDelivery({
      organizationId: context.organization.id,
      applicationId: application.id,
      id: formString(formData, "deliveryId"),
    });
    if (!delivery) throw new ActionError("Delivery not found.");
    await audit(
      context,
      application,
      "hook_delivery.retried",
      { type: "hook_delivery", id: delivery.id },
      { application_id: application.id, endpoint_id: delivery.endpointId },
    );
    refresh();
    return null;
  });
}

/** Example payloads are JSON objects; an empty field means none. */
function parseExample(value: string): Record<string, unknown>[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ActionError("The example must be valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ActionError("The example must be a JSON object.");
  }
  return [parsed as Record<string, unknown>];
}

export async function createHookEventTypeAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "create");
    const environment = await environmentFromForm(context, formData);
    const eventType = await createHookEventType({
      organizationId: context.organization.id,
      environmentId: environment.id,
      name: formString(formData, "name"),
      description: formString(formData, "description") || null,
      examples: parseExample(formString(formData, "example")),
    });
    await audit(context, scopeOf(environment), "hook_event_type.created", {
      type: "hook_event_type",
      id: eventType.id,
      label: eventType.name,
    });
    refresh();
    return null;
  });
}

export async function setHookEventTypeArchivedAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "delete");
    const environment = await environmentFromForm(context, formData);
    const archived = formString(formData, "archived") === "true";
    const eventType = await updateHookEventType({
      organizationId: context.organization.id,
      environmentId: environment.id,
      name: formString(formData, "name"),
      archived,
    });
    await audit(
      context,
      scopeOf(environment),
      archived ? "hook_event_type.archived" : "hook_event_type.updated",
      { type: "hook_event_type", id: eventType.id, label: eventType.name },
      { archived },
    );
    refresh();
    return null;
  });
}

export async function saveHookPortalSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const environment = await environmentFromForm(context, formData);
    const theme = formString(formData, "theme");
    if (!(PORTAL_THEMES as readonly string[]).includes(theme)) {
      throw new ActionError("Choose a theme.");
    }
    const accentColor = formString(formData, "accentColor");
    if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      throw new ActionError("The accent color must look like #2563eb.");
    }
    const settings = await setHookPortalSettings({
      organizationId: context.organization.id,
      environmentId: environment.id,
      settings: {
        allowedOrigins: formString(formData, "allowedOrigins")
          .split(/[\s,]+/)
          .filter(Boolean),
        displayName: formString(formData, "displayName") || null,
        accentColor: accentColor || null,
        theme: theme as PortalTheme,
      },
    });
    await audit(
      context,
      scopeOf(environment),
      "hook_portal_settings.updated",
      { type: "environment", id: environment.id, label: environment.name },
      { allowed_origins: settings.allowedOrigins },
    );
    refresh();
    return null;
  });
}
