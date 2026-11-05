"use server";

import {
  assignableOrgRoles,
  canRemoveOrgMember,
  INVITABLE_ORG_ROLES,
  type InvitableOrgRole,
  isOrgRole,
} from "@coss/auth/permissions";
import {
  getOrganizationMember,
  getPendingInvitation,
  isScimManagedUser,
  listOrganizationMembers,
  listPendingInvitations,
} from "@coss/tenancy";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, ForbiddenError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { planGate } from "@/lib/billing";
import { rateLimitRuntime } from "@/lib/rate-limit";
import { requireOrgPermission } from "@/lib/session";

function isInvitableRole(value: string): value is InvitableOrgRole {
  return (INVITABLE_ORG_ROLES as readonly string[]).includes(value);
}

const MANAGED_BY_DIRECTORY =
  "This member is managed by your identity provider's directory: change them there.";

/** Members an active directory (SCIM) user holds, except owners (the directory never changes those). */
async function isDirectoryManaged(
  organizationId: string,
  target: { role: string; user: { id: string } },
) {
  if (target.role.split(",").includes("owner")) return false;
  return isScimManagedUser({ organizationId, userId: target.user.id });
}

/**
 * Runs `send` (an invitation email) against the organization's `dashboard.invitations` quota;
 * the token is given back when Better Auth refuses the invitation.
 */
async function withInvitationQuota<T>(organizationId: string, send: () => Promise<T>): Promise<T> {
  const { limiter } = rateLimitRuntime();
  const request = {
    buckets: ["dashboard.invitations" as const],
    subject: organizationId,
    organizationId,
  };
  const decision = await limiter.consume(request);
  if (!decision.allowed) {
    throw new ActionError(
      "This organization has sent too many invitations today. Try again later.",
    );
  }
  try {
    return await send();
  } catch (error) {
    await limiter.refund(request);
    throw error;
  }
}

/** Invites by email. The accept link is logged to the web server console (no delivery yet). */
export async function inviteMemberAction(
  _previous: ActionResult<{ email: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ email: string }>> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      invitation: ["create"],
    });
    const email = formString(formData, "email").toLowerCase();
    if (!z.email().safeParse(email).success) throw new ActionError("Enter a valid email address.");
    const role = formString(formData, "role");
    if (!isInvitableRole(role)) throw new ActionError("Choose a role: admin or member.");

    // Pending invitations count: each may become a member.
    const [members, invitations] = await Promise.all([
      listOrganizationMembers({ organizationId: organization.id }),
      listPendingInvitations({ organizationId: organization.id }),
    ]);
    await planGate().requireCapacity(
      organization.id,
      "members",
      members.length + invitations.length,
    );

    // organizationId is explicit: Better Auth would otherwise fall back to the active org.
    await withInvitationQuota(organization.id, async () =>
      auth.api.createInvitation({
        headers: await headers(),
        body: { email, role, organizationId: organization.id },
      }),
    );
    await recordAudit(session, {
      organizationId: organization.id,
      action: "invitation.created",
      target: { type: "invitation", id: null, label: email },
      metadata: { role },
    });
    refresh();
    return { email };
  });
}

/**
 * Sends a pending invitation again with a fresh expiry; the invitation (and its link) stays the
 * same. Only canonical invitable roles are re-sent (Better Auth reuses the stored role).
 */
export async function resendInvitationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      invitation: ["create"],
    });
    const invitation = await getPendingInvitation({
      organizationId: organization.id,
      invitationId: formString(formData, "invitationId"),
    });
    if (!invitation) throw new ActionError("This invitation is no longer pending.");
    const role = invitation.role ?? "member";
    if (!isInvitableRole(role)) throw new ActionError("This invitation has an unknown role.");

    // `resend: true` makes Better Auth extend and re-send the pending invitation for this email.
    await withInvitationQuota(organization.id, async () =>
      auth.api.createInvitation({
        headers: await headers(),
        body: { email: invitation.email, role, organizationId: organization.id, resend: true },
      }),
    );
    await recordAudit(session, {
      organizationId: organization.id,
      action: "invitation.resent",
      target: { type: "invitation", id: invitation.id, label: invitation.email },
    });
    refresh();
    return null;
  });
}

/** Cancels a pending invitation of this organization; its accept link stops working. */
export async function cancelInvitationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      invitation: ["cancel"],
    });
    const invitation = await getPendingInvitation({
      organizationId: organization.id,
      invitationId: formString(formData, "invitationId"),
    });
    if (!invitation) throw new ActionError("This invitation is no longer pending.");

    // The session-bound call lets Better Auth re-check membership and invitation:cancel itself.
    await auth.api.cancelInvitation({
      headers: await headers(),
      body: { invitationId: invitation.id },
    });
    await recordAudit(session, {
      organizationId: organization.id,
      action: "invitation.canceled",
      target: { type: "invitation", id: invitation.id, label: invitation.email },
    });
    refresh();
    return null;
  });
}

/**
 * Changes a member's role. `assignableOrgRoles` gives a clear error for what Better Auth would
 * reject anyway; Better Auth re-checks everything, including that the last owner can't step down.
 */
export async function updateMemberRoleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, member, session } = await requireOrgPermission(
      formString(formData, "orgSlug"),
      {
        member: ["update"],
      },
    );
    const target = await getOrganizationMember({
      organizationId: organization.id,
      memberId: formString(formData, "memberId"),
    });
    if (!target) throw new ActionError("Member not found.");
    const role = formString(formData, "role");
    if (!isOrgRole(role)) throw new ActionError("Choose a role.");
    if (!assignableOrgRoles(member.role, target.role).includes(role)) {
      throw new ForbiddenError("Only owners can change an owner's role or make someone an owner.");
    }
    if (role === target.role) return null;
    if (role !== "owner" && (await isDirectoryManaged(organization.id, target))) {
      throw new ActionError(MANAGED_BY_DIRECTORY);
    }

    // organizationId is explicit: Better Auth would otherwise fall back to the active org.
    await auth.api.updateMemberRole({
      headers: await headers(),
      body: { memberId: target.id, role, organizationId: organization.id },
    });
    await recordAudit(session, {
      organizationId: organization.id,
      action: "member.role_changed",
      target: { type: "user", id: target.user.id, label: target.user.email },
      metadata: { role: { from: target.role, to: role } },
    });
    refresh();
    return null;
  });
}

/**
 * Removes another member from the organization. `canRemoveOrgMember` gives a clear error for what
 * Better Auth would reject anyway; Better Auth re-checks everything, including the last owner.
 */
export async function removeMemberAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, member, session } = await requireOrgPermission(
      formString(formData, "orgSlug"),
      {
        member: ["delete"],
      },
    );
    const target = await getOrganizationMember({
      organizationId: organization.id,
      memberId: formString(formData, "memberId"),
    });
    if (!target) throw new ActionError("Member not found.");
    if (target.id === member.id) {
      throw new ActionError("To remove yourself, leave the organization from its settings.");
    }
    if (!canRemoveOrgMember(member.role, target.role)) {
      throw new ForbiddenError("Only owners can remove an owner.");
    }
    if (await isDirectoryManaged(organization.id, target)) {
      throw new ActionError(MANAGED_BY_DIRECTORY);
    }

    // organizationId is explicit: Better Auth would otherwise fall back to the active org.
    await auth.api.removeMember({
      headers: await headers(),
      body: { memberIdOrEmail: target.id, organizationId: organization.id },
    });
    await recordAudit(session, {
      organizationId: organization.id,
      action: "member.removed",
      target: { type: "user", id: target.user.id, label: target.user.email },
      metadata: { role: target.role },
    });
    refresh();
    return null;
  });
}
