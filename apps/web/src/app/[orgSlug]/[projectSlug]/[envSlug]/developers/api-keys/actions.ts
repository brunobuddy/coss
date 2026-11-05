"use server";

import {
  InvalidKeyPermissionsError,
  isApiKeyPreset,
  type KeyPermissions,
  parsePermissionStrings,
  permissionStrings,
  readOnlyPermissions,
  SENDING_PERMISSIONS,
} from "@coss/auth/api-key-permissions";
import {
  createEnvironmentApiKey,
  getEnvironment,
  getKeyBinding,
  keyCreationAllowed,
  listOrganizationMembers,
  revokePersonalApiKey,
  setEnvironmentPersonalKeys,
} from "@coss/tenancy";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { liveKeyRestriction } from "@/lib/live-keys";
import { type OrgContext, requireOrgPermission } from "@/lib/session";

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

/**
 * What the form grants: `full`, a preset's permissions, or the checked `resource:action` values
 * (`custom`). `createEnvironmentApiKey` validates them against the catalog.
 */
function requestedPermissions(
  formData: FormData,
  /** A personal key's owner's role (`undefined`: an organization key). */
  ownerRole: string | null | undefined,
): "full" | KeyPermissions {
  const preset = formString(formData, "access");
  if (!isApiKeyPreset(preset)) throw new ActionError("Choose what the key can access.");
  if (preset === "full") return "full";
  if (preset === "sending") return SENDING_PERMISSIONS;
  if (preset === "read_only") return readOnlyPermissions(ownerRole);
  const values = formData.getAll("permission").filter((v): v is string => typeof v === "string");
  try {
    return parsePermissionStrings(values);
  } catch (error) {
    if (error instanceof InvalidKeyPermissionsError) throw new ActionError(error.message);
    throw error;
  }
}

/**
 * Who the new key is assigned to: `organization` (an organization key), `me` or a member's user
 * id (a personal key). Members only ever create their own (`keyCreationAllowed`).
 */
function requestedOwner(context: OrgContext, formData: FormData): string | null {
  const owner = formString(formData, "owner") || "me";
  if (owner === "organization") return null;
  if (owner === "me") return context.session.user.id;
  return owner;
}

/** The role of a personal key's owner (`undefined` for an organization key). */
async function ownerRoleOf(
  context: OrgContext,
  ownerUserId: string | null,
): Promise<string | null | undefined> {
  if (ownerUserId === null) return undefined;
  if (ownerUserId === context.session.user.id) return context.member.role;
  const members = await listOrganizationMembers({ organizationId: context.organization.id });
  return members.find((m) => m.user.id === ownerUserId)?.role ?? null;
}

/**
 * Mints a key for this environment. The plaintext key is only ever in this action's result
 * (shown once in a dialog); it is never stored or put in a URL.
 */
export async function createApiKeyAction(
  _previous: ActionResult<{ name: string; key: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ name: string; key: string }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      apiKey: ["create"],
    });
    const environment = await environmentFromForm(context, formData);
    const ownerUserId = requestedOwner(context, formData);
    const permissions = requestedPermissions(formData, await ownerRoleOf(context, ownerUserId));
    if (
      !keyCreationAllowed({
        role: context.member.role,
        environment,
        ownerUserId,
        creatorUserId: context.session.user.id,
      })
    ) {
      throw new ActionError(
        ownerUserId === context.session.user.id
          ? "Personal API keys aren't allowed in this environment."
          : "Only owners and admins can create organization keys or keys for other members.",
      );
    }
    if (environment.mode === "live") {
      const restriction = await liveKeyRestriction(context.session, context.organization.id);
      if (restriction) throw new ActionError(restriction);
    }
    const created = await createEnvironmentApiKey({
      organizationId: context.organization.id,
      environmentId: environment.id,
      name: formString(formData, "name"),
      userId: context.session.user.id,
      ownerUserId,
      permissions,
    });
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "api_key.created",
      target: { type: "api_key", id: created.id, label: created.name },
      projectId: environment.projectId,
      environmentId: environment.id,
      metadata: {
        mode: environment.mode,
        access: created.access,
        ...(ownerUserId ? { owner_user_id: ownerUserId } : {}),
        ...(created.access === "restricted"
          ? { permissions: permissionStrings(created.permissions) }
          : {}),
      },
    });
    refresh();
    return { name: created.name, key: created.key };
  });
}

/**
 * Revokes (deletes) a key after checking it is bound to this environment of this org. Owners and
 * admins revoke any key; members only their own personal keys.
 */
export async function revokeApiKeyAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      apiKey: ["create"],
    });
    const environment = await environmentFromForm(context, formData);
    const binding = await getKeyBinding({
      organizationId: context.organization.id,
      keyId: formString(formData, "keyId"),
    });
    if (!binding || binding.environmentId !== environment.id) {
      throw new ActionError("API key not found.");
    }
    if (context.can({ apiKey: ["delete"] })) {
      // The session-bound call lets Better Auth re-check membership and apiKey:delete itself.
      await auth.api.deleteApiKey({
        headers: await headers(),
        body: { keyId: binding.apiKeyId },
      });
    } else if (binding.ownerUserId === context.session.user.id) {
      await revokePersonalApiKey({
        organizationId: context.organization.id,
        apiKeyId: binding.apiKeyId,
        ownerUserId: context.session.user.id,
      });
    } else {
      throw new ActionError("You can only revoke your own personal keys.");
    }
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "api_key.revoked",
      target: { type: "api_key", id: binding.apiKeyId, label: binding.name },
      projectId: environment.projectId,
      environmentId: environment.id,
    });
    refresh();
    return null;
  });
}

/** Opens or closes the environment to members' personal keys (existing keys keep working). */
export async function setPersonalKeysAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      environment: ["update"],
    });
    const environment = await environmentFromForm(context, formData);
    const enabled = formString(formData, "required") === "true";
    const updated = await setEnvironmentPersonalKeys({
      organizationId: context.organization.id,
      environmentId: environment.id,
      enabled,
    });
    if (!updated) throw new ActionError("Environment not found.");
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "environment.personal_keys_updated",
      target: { type: "environment", id: environment.id, label: environment.name },
      projectId: environment.projectId,
      environmentId: environment.id,
      metadata: { personal_keys: enabled },
    });
    refresh();
    return null;
  });
}
