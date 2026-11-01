"use server";

import { DASHBOARD_PATH } from "@coss/auth/slugs";
import { isId } from "@coss/db/id";
import {
  changeRateLimitOverride,
  isOverridableBucket,
  type LimitRule,
  MAX_RULE_VALUE,
  parsePeriod,
} from "@coss/ratelimit";
import { getRiskAssessment, listRiskAssessmentsForEmail, recordRiskFeedback } from "@coss/risk";
import type { RiskAssessmentOutput } from "@coss/risk/schemas";
import {
  ADMIN_REASON_MAX_LENGTH,
  type AdminActor,
  deleteOrganizationAsAdmin,
  disableOrganizationScim,
  disableOrganizationSso,
  disableOrganizationSsoRequirement,
  getUserForAdmin,
  listUserMembershipsForAdmin,
  planOrganizationTakedown,
  recordAdminAction,
  resetUserTwoFactor,
  revokeApiKeyAsAdmin,
  suspendOrganization,
  unlinkUserSso,
  unsuspendOrganization,
} from "@coss/tenancy/admin";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ABUSE_CATEGORIES, type AbuseCategory, isAbuseCategory } from "@/lib/abuse-categories";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { supportAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { riskHasher, signUpRiskScope } from "@/lib/risk";
import { requirePlatformAdminAction } from "@/lib/session";
import { isSystemOrganization, SYSTEM_ORGANIZATION_MESSAGE } from "@/lib/system-organization";

/**
 * Platform admin actions. Better Auth's admin HTTP routes are disabled (`disabledPaths`), so these
 * are the only way to ban, change roles, impersonate or revoke sessions, and each one records an
 * `admin_audit_event`. Better Auth still re-checks the caller's admin role on every call.
 */

/** Ban durations offered by the dashboard, in seconds (`""` = permanent). */
const BAN_DURATIONS: Record<string, number | undefined> = {
  "": undefined,
  "1d": 86_400,
  "7d": 7 * 86_400,
  "30d": 30 * 86_400,
};

function formUserId(formData: FormData): string {
  const userId = formString(formData, "userId");
  if (!isId("user", userId)) throw new ActionError("User not found.");
  return userId;
}

function formOrganizationId(formData: FormData): string {
  const organizationId = formString(formData, "organizationId");
  if (!isId("org", organizationId)) throw new ActionError("Organization not found.");
  return organizationId;
}

function optionalReason(formData: FormData): string | null {
  const reason = formString(formData, "reason");
  if (reason.length > ADMIN_REASON_MAX_LENGTH) {
    throw new ActionError(`The reason must be at most ${ADMIN_REASON_MAX_LENGTH} characters.`);
  }
  return reason || null;
}

function requiredReason(formData: FormData): string {
  const reason = optionalReason(formData);
  if (!reason) throw new ActionError("Enter a reason. It is kept in the audit log.");
  return reason;
}

/** An admin may not act on their own account from the console (lockout and audit hygiene). */
function assertNotSelf(actor: AdminActor, userId: string): void {
  if (actor.userId === userId) throw new ActionError("You can't do that to your own account.");
}

async function targetEmail(userId: string): Promise<string> {
  const user = await auth.api.getUser({ headers: await headers(), query: { id: userId } });
  return user.email;
}

/**
 * Bans a user through Better Auth (which also deletes their sessions) and records it. `duration`
 * is a key of `BAN_DURATIONS`.
 */
async function banUser(input: {
  actor: AdminActor;
  userId: string;
  reason: string;
  duration: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const banExpiresIn = BAN_DURATIONS[input.duration];
  const email = await targetEmail(input.userId);
  await auth.api.banUser({
    headers: await headers(),
    body: { userId: input.userId, banReason: input.reason, ...(banExpiresIn && { banExpiresIn }) },
  });
  await recordAdminAction({
    actor: input.actor,
    action: "user.ban",
    target: { type: "user", id: input.userId },
    reason: input.reason,
    metadata: { email, duration: input.duration || "permanent", ...input.metadata },
  });
}

/** Bans a user: signs them out everywhere and blocks sign-in until unbanned or expired. */
export async function banUserAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const userId = formUserId(formData);
    assertNotSelf(actor, userId);
    const reason = requiredReason(formData);
    const duration = formString(formData, "duration");
    if (!Object.hasOwn(BAN_DURATIONS, duration)) throw new ActionError("Choose a ban duration.");

    await banUser({ actor, userId, reason, duration });
    refresh();
    return null;
  });
}

export async function unbanUserAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const userId = formUserId(formData);
    const reason = optionalReason(formData);
    const email = await targetEmail(userId);
    await auth.api.unbanUser({ headers: await headers(), body: { userId } });
    await recordAdminAction({
      actor,
      action: "user.unban",
      target: { type: "user", id: userId },
      reason,
      metadata: { email },
    });
    refresh();
    return null;
  });
}

/** Grants or removes the platform admin role. */
export async function setUserRoleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const userId = formUserId(formData);
    assertNotSelf(actor, userId);
    const role = formString(formData, "role");
    if (role !== "admin" && role !== "user") throw new ActionError("Choose a role.");
    const reason = optionalReason(formData);

    const email = await targetEmail(userId);
    await auth.api.setRole({ headers: await headers(), body: { userId, role } });
    await recordAdminAction({
      actor,
      action: "user.set_role",
      target: { type: "user", id: userId },
      reason,
      metadata: { email, role },
    });
    refresh();
    return null;
  });
}

/**
 * Account recovery for a user who lost their authenticator and backup codes: turns their
 * two-factor authentication off so their password alone signs them in.
 */
export async function resetTwoFactorAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const userId = formUserId(formData);
    assertNotSelf(actor, userId);
    await resetUserTwoFactor({ userId, reason: requiredReason(formData), actor });
    refresh();
    return null;
  });
}

/**
 * Recovery for a user whose SSO sign-in broke: unlinks their SSO accounts and signs out their SSO
 * sessions. They can link again on their next SSO sign-in, or set a password.
 */
export async function unlinkUserSsoAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const userId = formUserId(formData);
    assertNotSelf(actor, userId);
    await unlinkUserSso({ userId, reason: requiredReason(formData), actor });
    refresh();
    return null;
  });
}

/** Signs out every session of the user. */
export async function revokeUserSessionsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const userId = formUserId(formData);
    assertNotSelf(actor, userId);
    const reason = optionalReason(formData);
    const email = await targetEmail(userId);
    await auth.api.revokeUserSessions({ headers: await headers(), body: { userId } });
    await recordAdminAction({
      actor,
      action: "user.revoke_sessions",
      target: { type: "user", id: userId },
      reason,
      metadata: { email },
    });
    refresh();
    return null;
  });
}

/**
 * Signs out one session. The form carries only the session id; its token (a credential) is looked
 * up here and never sent to the browser.
 */
export async function revokeUserSessionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const userId = formUserId(formData);
    const reason = optionalReason(formData);
    const sessionId = formString(formData, "sessionId");
    const requestHeaders = await headers();
    const { sessions } = await auth.api.listUserSessions({
      headers: requestHeaders,
      body: { userId },
    });
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) throw new ActionError("This session has already ended.");
    await auth.api.revokeUserSession({
      headers: requestHeaders,
      body: { sessionToken: target.token },
    });
    await recordAdminAction({
      actor,
      action: "user.revoke_session",
      target: { type: "user", id: userId },
      reason,
      metadata: { sessionId, impersonatedBy: target.impersonatedBy ?? null },
    });
    refresh();
    return null;
  });
}

/**
 * Starts an impersonation session (one hour) after recording why. Live API keys can't be created
 * while impersonating, and the banner offers to stop.
 */
export async function impersonateUserAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const userId = formUserId(formData);
    assertNotSelf(actor, userId);
    const reason = requiredReason(formData);
    const email = await targetEmail(userId);
    // Better Auth refuses admins and banned users; the response switches the session cookies.
    await auth.api.impersonateUser({ headers: await headers(), body: { userId } });
    await recordAdminAction({
      actor,
      action: "user.impersonate",
      target: { type: "user", id: userId },
      reason,
      metadata: { email },
    });
    redirect(DASHBOARD_PATH);
  });
}

/** Suspends an organization (API keys refused, webhooks held, dashboard read-only). */
export async function suspendOrganizationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = formOrganizationId(formData);
    if (await isSystemOrganization(organizationId)) {
      throw new ActionError(SYSTEM_ORGANIZATION_MESSAGE);
    }
    await suspendOrganization({ organizationId, reason: requiredReason(formData), actor });
    await supportAudit(organizationId, "organization.suspended");
    refresh();
    return null;
  });
}

export async function unsuspendOrganizationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = formOrganizationId(formData);
    await unsuspendOrganization({ organizationId, reason: optionalReason(formData), actor });
    await supportAudit(organizationId, "organization.unsuspended");
    refresh();
    return null;
  });
}

function formCategory(formData: FormData): AbuseCategory {
  const category = formString(formData, "category");
  if (!isAbuseCategory(category)) throw new ActionError("Choose what kind of abuse this is.");
  return category;
}

/** The note Risk keeps with the feedback: the category, then the admin's reason (500 characters). */
function riskNote(category: AbuseCategory, reason: string): string {
  return `${ABUSE_CATEGORIES[category].label}: ${reason}`.slice(0, 500);
}

type SignUpScope = NonNullable<Awaited<ReturnType<typeof signUpRiskScope>>>;

/**
 * Reports one of coss.com's own sign-up assessments to coss.com Risk with the category's outcome:
 * its mailbox, device, IP and network count against later sign-ups (`history.fraud_*`), and an
 * open review is resolved. `false` when it already carried that outcome (nothing recorded).
 */
async function reportAssessment(input: {
  actor: AdminActor;
  scope: SignUpScope;
  assessment: RiskAssessmentOutput;
  category: AbuseCategory;
  reason: string;
}): Promise<boolean> {
  const { actor, scope, assessment, category, reason } = input;
  const outcome = ABUSE_CATEGORIES[category].outcome;
  if (assessment.outcome === outcome && assessment.review_status !== "open") return false;
  const updated = await recordRiskFeedback(
    riskHasher(),
    scope,
    assessment.id,
    { outcome, note: riskNote(category, reason) },
    { source: "dashboard", actorId: actor.userId },
  );
  if (!updated) return false;
  await recordAdminAction({
    actor,
    action: "risk_assessment.report",
    target: { type: "risk_assessment", id: assessment.id },
    reason,
    metadata: {
      email: assessment.user.email,
      category,
      outcome,
      decision: assessment.decision,
    },
  });
  return true;
}

/**
 * Reports every sign-up assessment of these addresses (blocked attempts included). Nothing when
 * sign-ups aren't assessed (`RISK_SIGNUP_ENVIRONMENT_ID` unset). Returns the reported ids.
 */
async function reportSignUps(input: {
  actor: AdminActor;
  emails: string[];
  category: AbuseCategory;
  reason: string;
}): Promise<string[]> {
  const scope = await signUpRiskScope();
  if (!scope) return [];
  const reported: string[] = [];
  for (const email of new Set(input.emails.map((address) => address.toLowerCase()))) {
    const assessments = await listRiskAssessmentsForEmail(scope, email, {
      event: "signup",
      limit: 20,
    });
    for (const assessment of assessments) {
      if (await reportAssessment({ ...input, scope, assessment })) reported.push(assessment.id);
    }
  }
  return reported;
}

type OrganizationTakedown = {
  organizationId: string;
  revokedKeyIds: string[];
  bannedUserIds: string[];
  bannedEmails: string[];
  keptUserIds: string[];
};

/**
 * Suspends the organization (with the category), revokes every API key, and bans the members who
 * have nothing else on the platform (`planOrganizationTakedown`). Each step is audited on its own
 * and skipped when already done, so running it again finishes a partial run. `null` when the
 * organization is already being deleted (nothing left to take down).
 */
async function takeDownOrganization(input: {
  actor: AdminActor;
  organizationId: string;
  category: AbuseCategory;
  reason: string;
}): Promise<OrganizationTakedown | null> {
  const { actor, organizationId, category, reason } = input;
  const plan = await planOrganizationTakedown(organizationId);
  if (plan.deleting) return null;

  if (!plan.suspended) {
    await suspendOrganization({ organizationId, reason, category, actor });
    await supportAudit(organizationId, "organization.suspended");
  }
  const revokedKeyIds: string[] = [];
  for (const key of plan.apiKeys) {
    await revokeApiKeyAsAdmin({ organizationId, keyId: key.id, reason, actor });
    await supportAudit(organizationId, "api_key.revoked", { type: "api_key", id: key.id });
    revokedKeyIds.push(key.id);
  }
  const bannedUserIds: string[] = [];
  const bannedEmails: string[] = [];
  const keptUserIds: string[] = [];
  for (const member of plan.members) {
    if (member.keptBecause !== null || member.userId === actor.userId) {
      keptUserIds.push(member.userId);
      continue;
    }
    await banUser({
      actor,
      userId: member.userId,
      reason,
      duration: "",
      metadata: { takeDown: organizationId, category },
    });
    bannedUserIds.push(member.userId);
    bannedEmails.push(member.email);
  }
  return { organizationId, revokedKeyIds, bannedUserIds, bannedEmails, keptUserIds };
}

/**
 * Takes an abusive organization down and reports it, in one step: suspends it, revokes every API
 * key, bans the members who have nothing else on the platform, and reports those members'
 * sign-ups to coss.com Risk so the same mailbox, device and network are flagged next time.
 */
export async function takeDownOrganizationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = formOrganizationId(formData);
    if (await isSystemOrganization(organizationId)) {
      throw new ActionError(SYSTEM_ORGANIZATION_MESSAGE);
    }
    const category = formCategory(formData);
    const reason = requiredReason(formData);
    const result = await takeDownOrganization({ actor, organizationId, category, reason });
    if (!result) throw new ActionError("This organization is already being deleted.");
    const reportedAssessmentIds = await reportSignUps({
      actor,
      emails: result.bannedEmails,
      category,
      reason,
    });
    await recordAdminAction({
      actor,
      action: "organization.take_down",
      target: { type: "organization", id: organizationId },
      organizationId,
      reason,
      metadata: {
        category,
        bannedUserIds: result.bannedUserIds,
        keptUserIds: result.keptUserIds,
        revokedKeyIds: result.revokedKeyIds,
        reportedAssessmentIds,
      },
    });
    refresh();
    return null;
  });
}

export type ReportAbuseResult = { takenDown: boolean; organizations: number; reported: number };

/**
 * The admin console's one abuse flow, from a sign-up or a user. Always reports to coss.com Risk
 * (the sign-up named by `assessmentId`, else every sign-up of the user's address). With
 * `takeDown=on` it also takes down the organizations checked in the form (`organization:<id>`,
 * only the user's own memberships count) and bans the user permanently; the members banned with
 * those organizations are reported too.
 */
export async function reportAbuseAction(
  _previous: ActionResult<ReportAbuseResult> | null,
  formData: FormData,
): Promise<ActionResult<ReportAbuseResult>> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const category = formCategory(formData);
    const reason = requiredReason(formData);
    const scope = await signUpRiskScope();
    const assessmentId = formString(formData, "assessmentId");
    const assessment = assessmentId && scope ? await getRiskAssessment(scope, assessmentId) : null;
    if (assessmentId && !assessment) throw new ActionError("Sign-up not found.");

    if (formData.get("takeDown") !== "on") {
      let reported: string[];
      if (assessment && scope) {
        reported = (await reportAssessment({ actor, scope, assessment, category, reason }))
          ? [assessment.id]
          : [];
      } else {
        const userId = formUserId(formData);
        const user = await getUserForAdmin(userId);
        if (!user) throw new ActionError("User not found.");
        if (!scope) {
          throw new ActionError(
            "Sign-ups aren't assessed (RISK_SIGNUP_ENVIRONMENT_ID), so there is nothing to report.",
          );
        }
        reported = await reportSignUps({ actor, emails: [user.email], category, reason });
      }
      if (reported.length === 0) throw new ActionError("This sign-up is already reported.");
      refresh();
      return { takenDown: false, organizations: 0, reported: reported.length };
    }

    const userId = formUserId(formData);
    assertNotSelf(actor, userId);
    const user = await getUserForAdmin(userId);
    if (!user) throw new ActionError("User not found.");
    if ((user.role ?? "").split(",").some((role) => role.trim() === "admin")) {
      throw new ActionError("Platform admins can't be taken down: remove the admin role first.");
    }
    if (assessment && assessment.user.email?.toLowerCase() !== user.email.toLowerCase()) {
      throw new ActionError("This sign-up belongs to another address.");
    }
    const memberships = await listUserMembershipsForAdmin(userId);
    const selected = memberships.filter(
      (membership) => formData.get(`organization:${membership.organization.id}`) === "on",
    );
    for (const membership of selected) {
      if (await isSystemOrganization(membership.organization.id)) {
        throw new ActionError(SYSTEM_ORGANIZATION_MESSAGE);
      }
    }

    const takedowns: OrganizationTakedown[] = [];
    for (const membership of selected) {
      const result = await takeDownOrganization({
        actor,
        organizationId: membership.organization.id,
        category,
        reason,
      });
      if (!result) continue;
      takedowns.push(result);
      await recordAdminAction({
        actor,
        action: "organization.take_down",
        target: { type: "organization", id: result.organizationId },
        organizationId: result.organizationId,
        reason,
        metadata: {
          category,
          via: { type: "user", id: userId },
          bannedUserIds: result.bannedUserIds,
          keptUserIds: result.keptUserIds,
          revokedKeyIds: result.revokedKeyIds,
        },
      });
    }
    // The user is the target: banned even when an organization's plan kept them for another one.
    const bannedUserIds = new Set(takedowns.flatMap((takedown) => takedown.bannedUserIds));
    if (!user.banned && !bannedUserIds.has(userId)) {
      await banUser({
        actor,
        userId,
        reason,
        duration: "",
        metadata: { takeDown: userId, category },
      });
      bannedUserIds.add(userId);
    }
    const reportedAssessmentIds = await reportSignUps({
      actor,
      emails: [user.email, ...takedowns.flatMap((takedown) => takedown.bannedEmails)],
      category,
      reason,
    });
    if (assessment && scope && !reportedAssessmentIds.includes(assessment.id)) {
      if (await reportAssessment({ actor, scope, assessment, category, reason })) {
        reportedAssessmentIds.push(assessment.id);
      }
    }
    await recordAdminAction({
      actor,
      action: "user.take_down",
      target: { type: "user", id: userId },
      reason,
      metadata: {
        email: user.email,
        category,
        organizationIds: takedowns.map((takedown) => takedown.organizationId),
        bannedUserIds: [...bannedUserIds],
        revokedKeyIds: takedowns.flatMap((takedown) => takedown.revokedKeyIds),
        reportedAssessmentIds,
      },
    });
    refresh();
    return {
      takenDown: true,
      organizations: takedowns.length,
      reported: reportedAssessmentIds.length,
    };
  });
}

/**
 * Tells coss.com Risk a sign-up was legitimate (a false positive): it takes back what reporting it
 * remembered and resolves an open review. It doesn't unban anyone or lift a suspension.
 */
export async function markSignUpLegitimateAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const reason = optionalReason(formData);
    const scope = await signUpRiskScope();
    const assessmentId = formString(formData, "assessmentId");
    const assessment = scope ? await getRiskAssessment(scope, assessmentId) : null;
    if (!scope || !assessment) throw new ActionError("Sign-up not found.");
    const previousOutcome = assessment.outcome;
    const updated = await recordRiskFeedback(
      riskHasher(),
      scope,
      assessment.id,
      { outcome: "legitimate", ...(reason ? { note: reason } : {}) },
      { source: "dashboard", actorId: actor.userId },
    );
    if (!updated) throw new ActionError("Sign-up not found.");
    await recordAdminAction({
      actor,
      action: "risk_assessment.mark_legitimate",
      target: { type: "risk_assessment", id: assessment.id },
      reason,
      metadata: {
        email: assessment.user.email,
        previousOutcome,
        decision: assessment.decision,
      },
    });
    refresh();
    return null;
  });
}

/**
 * Deletes an organization, suspended or not (audited). Members, invitations, API keys and the SSO
 * provider go at once; the worker deletes the rest.
 */
export async function deleteOrganizationAdminAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    await deleteOrganizationAsAdmin({
      organizationId: formOrganizationId(formData),
      confirmSlug: formString(formData, "confirm"),
      reason: requiredReason(formData),
      actor,
    });
    refresh();
    return null;
  });
}

/** Revokes one of an organization's API keys (e.g. a leaked key). */
export async function revokeApiKeyAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = formOrganizationId(formData);
    const keyId = formString(formData, "keyId");
    await revokeApiKeyAsAdmin({ organizationId, keyId, reason: requiredReason(formData), actor });
    await supportAudit(organizationId, "api_key.revoked", { type: "api_key", id: keyId });
    refresh();
    return null;
  });
}

/** Lets the organization's members open it without SSO again (their IdP is down). */
export async function disableOrganizationSsoRequirementAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = formOrganizationId(formData);
    await disableOrganizationSsoRequirement({
      organizationId,
      reason: requiredReason(formData),
      actor,
    });
    await supportAudit(organizationId, "sso_requirement.disabled");
    refresh();
    return null;
  });
}

/** Stops SSO sign-in for the organization (and its requirement) until its admins save it again. */
export async function disableOrganizationSsoAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = formOrganizationId(formData);
    await disableOrganizationSso({ organizationId, reason: requiredReason(formData), actor });
    await supportAudit(organizationId, "sso.disabled");
    refresh();
    return null;
  });
}

/** Disconnects the organization's directory (SCIM); its members stay. */
export async function disableOrganizationScimAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = formOrganizationId(formData);
    const { complete } = await disableOrganizationScim({
      organizationId,
      reason: requiredReason(formData),
      actor,
    });
    refresh();
    if (!complete) {
      throw new ActionError("The directory is still being released: run this again to finish.");
    }
    await supportAudit(organizationId, "scim.disabled");
    return null;
  });
}

function formBucket(formData: FormData): string {
  const bucket = formString(formData, "bucket");
  if (!isOverridableBucket(bucket)) throw new ActionError("This rate limit can't be overridden.");
  return bucket;
}

function ruleNumber(formData: FormData, name: string, label: string): number | undefined {
  const value = formString(formData, name);
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_RULE_VALUE) {
    throw new ActionError(`${label} must be a whole number from 1 to ${MAX_RULE_VALUE}.`);
  }
  return number;
}

function formRule(formData: FormData): LimitRule {
  const limit = ruleNumber(formData, "limit", "The limit");
  if (limit === undefined) throw new ActionError("Enter a limit.");
  const burst = ruleNumber(formData, "burst", "The burst");
  let periodMs: number;
  try {
    periodMs = parsePeriod(formString(formData, "period"));
  } catch {
    throw new ActionError("Enter a period such as 1s, 5m, 1h or 1d.");
  }
  if (periodMs < 1 || periodMs > MAX_RULE_VALUE) {
    throw new ActionError("The period must be between 1ms and 24 days.");
  }
  return { limit, periodMs, ...(burst === undefined ? {} : { burst }) };
}

/** Gives an organization its own rule for one rate limit bucket (applies within a minute). */
export async function setRateLimitOverrideAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = formOrganizationId(formData);
    const bucket = formBucket(formData);
    const rule = formRule(formData);
    const reason = requiredReason(formData);
    await changeRateLimitOverride({ organizationId, bucket, rule, actor, reason });
    refresh();
    return null;
  });
}

/** Puts one of an organization's rate limits back to the default (applies within a minute). */
export async function resetRateLimitOverrideAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const organizationId = formOrganizationId(formData);
    const bucket = formBucket(formData);
    const reason = optionalReason(formData);
    await changeRateLimitOverride({ organizationId, bucket, rule: null, actor, reason });
    refresh();
    return null;
  });
}
