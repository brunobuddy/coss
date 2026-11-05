"use server";

import { WEBHOOK_EVENT_TYPES } from "@coss/email/schemas";
import { getEnvironment, readOrganizationApiVersion } from "@coss/tenancy";
import { versioning } from "@coss/versioning";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookEndpoint,
  recoverWebhookEndpoint,
  retryWebhookDelivery,
  revealWebhookSecret,
  rollWebhookEndpointSecret,
  updateWebhookEndpoint,
  WebhookError,
} from "@coss/webhooks";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { type OrgContext, requireOrgPermission } from "@/lib/session";
import { webhookManagementDeps } from "@/lib/webhooks";
import { RECOVER_SINCE_OPTIONS } from "./recover";
import { PREVIOUS_SECRET_OPTIONS } from "./secret-roll";

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return found;
}

function endpointAudit(
  context: OrgContext,
  endpoint: { id: string; url: string; projectId: string; environmentId: string },
  action: string,
  metadata?: Record<string, unknown>,
) {
  return recordAudit(context.session, {
    organizationId: context.organization.id,
    action,
    target: { type: "webhook_endpoint", id: endpoint.id, label: endpoint.url },
    projectId: endpoint.projectId,
    environmentId: endpoint.environmentId,
    metadata,
  });
}

/** The endpoint addressed by the form, checked to belong to that environment. */
async function endpointFromForm(context: OrgContext, formData: FormData) {
  const { environment } = await environmentFromForm(context, formData);
  const endpoint = await getWebhookEndpoint({
    organizationId: context.organization.id,
    id: formString(formData, "endpointId"),
  });
  if (!endpoint || endpoint.environmentId !== environment.id) {
    throw new ActionError("Webhook endpoint not found.");
  }
  return endpoint;
}

function userFacing<T>(body: () => Promise<T>): Promise<T> {
  return body().catch((error: unknown) => {
    if (error instanceof WebhookError) throw new ActionError(error.message);
    throw error;
  });
}

/** Creates an endpoint; the result carries its signing secret to show right away. */
export async function createWebhookEndpointAction(
  _previous: ActionResult<{ id: string; secret: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; secret: string }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      webhook: ["create"],
    });
    const { environment } = await environmentFromForm(context, formData);
    const known = new Set<string>(WEBHOOK_EVENT_TYPES);
    const selected = formData.getAll("eventTypes").filter((value) => typeof value === "string");
    if (selected.some((type) => !known.has(type))) throw new ActionError("Unknown event type.");
    if (selected.length === 0) throw new ActionError("Select at least one event.");
    // Events arrive in the organization's version (the one its API requests use by default).
    const apiVersion =
      (await readOrganizationApiVersion({ organizationId: context.organization.id })) ??
      versioning.latest;
    const { endpoint, secret } = await userFacing(() =>
      createWebhookEndpoint(
        {
          organizationId: context.organization.id,
          environmentId: environment.id,
          url: formString(formData, "url"),
          description: formString(formData, "description"),
          // Every type selected means "all", which includes types added later.
          eventTypes: selected.length === known.size ? [] : selected,
          apiVersion,
          userId: context.session.user.id,
        },
        webhookManagementDeps(),
      ),
    );
    await endpointAudit(context, endpoint, "webhook_endpoint.created", {
      event_types: endpoint.eventTypes,
    });
    refresh();
    return { id: endpoint.id, secret };
  });
}

export async function setWebhookEndpointEnabledAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      webhook: ["update"],
    });
    const endpoint = await endpointFromForm(context, formData);
    const enabled = formString(formData, "enabled") === "true";
    await updateWebhookEndpoint(
      { organizationId: context.organization.id, id: endpoint.id, enabled },
      webhookManagementDeps(),
    );
    await endpointAudit(
      context,
      endpoint,
      enabled ? "webhook_endpoint.enabled" : "webhook_endpoint.disabled",
    );
    refresh();
    return null;
  });
}

/** Renders the endpoint's events in the latest API version from now on, pending retries included. */
export async function upgradeWebhookEndpointVersionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      webhook: ["update"],
    });
    const endpoint = await endpointFromForm(context, formData);
    const apiVersion = formString(formData, "apiVersion");
    if (apiVersion !== versioning.latest) {
      throw new ActionError("A newer API version is available. Reload the page and review it.");
    }
    await userFacing(() =>
      updateWebhookEndpoint(
        { organizationId: context.organization.id, id: endpoint.id, apiVersion },
        webhookManagementDeps(),
      ),
    );
    refresh();
    return null;
  });
}

export async function deleteWebhookEndpointAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      webhook: ["delete"],
    });
    const endpoint = await endpointFromForm(context, formData);
    await deleteWebhookEndpoint({ organizationId: context.organization.id, id: endpoint.id });
    await endpointAudit(context, endpoint, "webhook_endpoint.deleted");
    redirect(
      `/${context.organization.slug}/${formString(formData, "projectSlug")}/` +
        `${formString(formData, "envSlug")}/developers/webhooks`,
    );
  });
}

/** The signing secret, for members who may manage the endpoint. */
export async function revealWebhookSecretAction(
  _previous: ActionResult<{ secret: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ secret: string }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      webhook: ["update"],
    });
    const endpoint = await endpointFromForm(context, formData);
    const secret = revealWebhookSecret(endpoint, webhookManagementDeps().secretsKeys);
    // Who has seen a signing secret matters when it leaks.
    await endpointAudit(context, endpoint, "webhook_endpoint.secret_revealed");
    return { secret };
  });
}

/**
 * Replaces the signing secret; the current one keeps signing deliveries for the chosen time. The
 * result carries the new secret to show right away.
 */
export async function rollWebhookSecretAction(
  _previous: ActionResult<{ secret: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ secret: string }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      webhook: ["update"],
    });
    const endpoint = await endpointFromForm(context, formData);
    // Compared as strings: an empty field must not read as 0 ("immediately").
    const chosen = formString(formData, "previousSecretExpiresIn");
    const option = PREVIOUS_SECRET_OPTIONS.find(({ seconds }) => String(seconds) === chosen);
    if (!option) throw new ActionError("Choose when the current secret stops signing.");
    const { secret } = await userFacing(() =>
      rollWebhookEndpointSecret(
        {
          organizationId: context.organization.id,
          id: endpoint.id,
          previousSecretExpiresIn: option.seconds,
        },
        webhookManagementDeps(),
      ),
    );
    await endpointAudit(context, endpoint, "webhook_endpoint.secret_rolled", {
      previous_secret_expires_in: option.seconds,
    });
    refresh();
    return { secret };
  });
}

export async function retryWebhookDeliveryAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      webhook: ["update"],
    });
    const endpoint = await endpointFromForm(context, formData);
    const retried = await retryWebhookDelivery({
      organizationId: context.organization.id,
      endpointId: endpoint.id,
      id: formString(formData, "deliveryId"),
    });
    if (!retried) throw new ActionError("This delivery is already scheduled.");
    await endpointAudit(context, endpoint, "webhook_delivery.retried", {
      delivery_id: formString(formData, "deliveryId"),
    });
    refresh();
    return null;
  });
}

/** Requeues the endpoint's deliveries that failed within the chosen period, for one more attempt each. */
export async function recoverWebhookEndpointAction(
  _previous: ActionResult<{ requeued: number; hasMore: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ requeued: number; hasMore: boolean }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      webhook: ["update"],
    });
    const endpoint = await endpointFromForm(context, formData);
    const chosen = formString(formData, "sinceHours");
    const option = RECOVER_SINCE_OPTIONS.find(({ hours }) => String(hours) === chosen);
    if (!option) throw new ActionError("Choose how far back to recover.");
    const since = new Date(Date.now() - option.hours * 3_600_000);
    const result = await userFacing(() =>
      recoverWebhookEndpoint({ organizationId: context.organization.id, id: endpoint.id, since }),
    );
    await endpointAudit(context, endpoint, "webhook_endpoint.recovered", {
      since: since.toISOString(),
      requeued: result.requeued,
    });
    refresh();
    return result;
  });
}
