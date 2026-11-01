"use server";

import { DASHBOARD_PATH, validateOrgName, validateOrgSlug } from "@coss/auth/slugs";
import { unpaidInvoiceCount } from "@coss/billing";
import {
  hideOrganizationLogo,
  refreshOrganizationLogo,
  requestOrganizationDeletion,
  setOrganizationApiVersion,
  setOrganizationTwoFactorRequired,
  TenancyError,
} from "@coss/tenancy";
import { versioning } from "@coss/versioning";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { requireOrgMember, requireOrgPermission } from "@/lib/session";

/**
 * Renames the organization and/or changes its slug. A new slug moves every dashboard URL, so the
 * browser follows it to the new settings page. Better Auth re-checks `organization:update`, slug
 * uniqueness and (through our `beforeUpdateOrganization` hook) the name and slug rules.
 */
export async function updateOrganizationAction(
  _previous: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  const result = await runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      organization: ["update"],
    });
    const name = formString(formData, "name");
    const slug = formString(formData, "slug").toLowerCase();
    const invalid = validateOrgName(name) ?? validateOrgSlug(slug);
    if (invalid) throw new ActionError(invalid);
    if (name === organization.name && slug === organization.slug) return { slug };

    // organizationId is explicit: Better Auth would otherwise fall back to the active org.
    await auth.api.updateOrganization({
      headers: await headers(),
      body: { organizationId: organization.id, data: { name, slug } },
    });
    await recordAudit(session, {
      organizationId: organization.id,
      action: "organization.updated",
      target: { type: "organization", id: organization.id, label: name },
      metadata: {
        ...(name !== organization.name ? { name: { from: organization.name, to: name } } : {}),
        ...(slug !== organization.slug ? { slug: { from: organization.slug, to: slug } } : {}),
      },
    });
    if (slug === organization.slug) refresh();
    return { slug };
  });
  if (result.ok && result.data.slug !== formString(formData, "orgSlug")) {
    redirect(`/${result.data.slug}/settings`);
  }
  return result;
}

/**
 * Removes the signed-in user from the organization. Better Auth refuses when they are its last
 * owner. Their API keys stay: keys belong to the organization, not to whoever created them.
 */
export async function leaveOrganizationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const { organization, suspended, session } = await requireOrgMember(
      formString(formData, "orgSlug"),
    );
    if (suspended) throw new ActionError("This organization is suspended.");
    await auth.api.leaveOrganization({
      headers: await headers(),
      body: { organizationId: organization.id },
    });
    await recordAudit(session, {
      organizationId: organization.id,
      action: "member.left",
      target: { type: "user", id: session.user.id, label: session.user.email },
    });
    return null;
  });
  if (result.ok) redirect(DASHBOARD_PATH);
  return result;
}

/**
 * Deletes the organization (owners only, `organization:delete`): everyone is locked out at once and
 * the worker deletes the rest (`requestOrganizationDeletion`). Typing the slug confirms it. Refused
 * while the organization is suspended (`requireOrgPermission`) and while impersonating: platform
 * admins delete organizations from the admin console, which records it.
 */
export async function deleteOrganizationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      organization: ["delete"],
    });
    if (session.session.impersonatedBy) {
      throw new ActionError("Organizations can't be deleted while impersonating a user.");
    }
    if (formString(formData, "confirm") !== organization.slug) {
      throw new ActionError(`Type ${organization.slug} to confirm.`);
    }
    // Tenancy can't see billing: check here, before anything is revoked.
    if ((await unpaidInvoiceCount(organization.id)) > 0) {
      throw new ActionError(
        "Pay or settle your open invoices first (Settings → Billing). Contact support if you need help.",
      );
    }
    await requestOrganizationDeletion({
      organizationId: organization.id,
      actor: { userId: session.user.id, email: session.user.email },
    });
    return null;
  });
  if (result.ok) redirect(DASHBOARD_PATH);
  return result;
}

/**
 * Turns the organization's two-factor requirement on or off. Members without it are sent to
 * /settings on their next request. Only someone who has two-factor themselves can turn it on.
 */
export async function setTwoFactorRequirementAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      organization: ["update"],
    });
    const required = formString(formData, "required") === "true";
    if (required && !session.user.twoFactorEnabled) {
      throw new ActionError("Set up two-factor authentication for your own account first.");
    }
    await setOrganizationTwoFactorRequired({ organizationId: organization.id, required });
    await recordAudit(session, {
      organizationId: organization.id,
      action: required ? "two_factor_requirement.enabled" : "two_factor_requirement.disabled",
      target: { type: "organization", id: organization.id, label: organization.name },
    });
    refresh();
    return null;
  });
}

/**
 * Upgrades the organization's pinned API version (what requests without a `Coss-Version` header
 * use) to the latest one. Versions only move forward.
 */
export async function upgradeApiVersionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      organization: ["update"],
    });
    // The version the dialog described; refuse if a newer one shipped since it was rendered.
    const apiVersion = formString(formData, "apiVersion");
    if (apiVersion !== versioning.latest) {
      throw new ActionError("A newer API version is available. Reload the page and review it.");
    }
    try {
      await setOrganizationApiVersion({
        organizationId: organization.id,
        apiVersion,
        userId: session.user.id,
      });
    } catch (error) {
      if (error instanceof TenancyError) throw new ActionError(error.message);
      throw error;
    }
    refresh();
    return null;
  });
}

/** Looks for the organization's logo again (and shows it again if it was hidden). */
export async function refreshLogoAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      organization: ["update"],
    });
    await refreshOrganizationLogo(organization.id);
    await recordAudit(session, {
      organizationId: organization.id,
      action: "organization.logo_refreshed",
      target: { type: "organization", id: organization.id, label: organization.name },
    });
    refresh();
    return null;
  });
}

/** Stops using a logo: the dashboard shows the organization's initials. */
export async function hideLogoAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      organization: ["update"],
    });
    await hideOrganizationLogo(organization.id);
    await recordAudit(session, {
      organizationId: organization.id,
      action: "organization.logo_hidden",
      target: { type: "organization", id: organization.id, label: organization.name },
    });
    refresh();
    return null;
  });
}
