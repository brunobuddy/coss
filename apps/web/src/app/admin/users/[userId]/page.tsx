import { listRiskAssessmentsForEmail } from "@coss/risk";
import {
  getUserForAdmin,
  listAdminAuditEvents,
  listUserMembershipsForAdmin,
  listUserSessionsForAdmin,
  listUserSsoAccountsForAdmin,
} from "@coss/tenancy/admin";
import { Badge } from "@coss/ui/components/badge";
import { Field, FieldLabel } from "@coss/ui/components/field";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import {
  OrganizationStatusBadge,
  PlatformRoleBadge,
  UserStatusBadge,
} from "@/components/admin/status-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { RiskDecisionBadge, RiskOutcomeBadge } from "@/components/risk-badges";
import { SpecItem, SpecList } from "@/components/spec-list";
import { formatDateTime } from "@/lib/format";
import { signUpRiskScope } from "@/lib/risk";
import { requirePlatformAdmin } from "@/lib/session";
import {
  banUserAction,
  impersonateUserAction,
  markSignUpLegitimateAction,
  resetTwoFactorAction,
  revokeUserSessionAction,
  revokeUserSessionsAction,
  setUserRoleAction,
  unbanUserAction,
  unlinkUserSsoAction,
} from "../../actions";
import { ReportAbuseDialog } from "../../report-abuse-dialog";

export const metadata: Metadata = { title: "User · Admin" };

const BAN_DURATIONS = [
  { value: "", label: "Permanently" },
  { value: "1d", label: "For 1 day" },
  { value: "7d", label: "For 7 days" },
  { value: "30d", label: "For 30 days" },
];

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[userId]">) {
  // Every admin page checks itself: Next renders the layout and the page in parallel, so the
  // layout's check alone would not keep this page's data out of the response.
  const { actor } = await requirePlatformAdmin();
  const { userId } = await params;
  const user = await getUserForAdmin(userId);
  if (!user) notFound();
  const signUpScope = await signUpRiskScope();
  const [memberships, sessions, ssoAccounts, { events }, [signUp]] = await Promise.all([
    listUserMembershipsForAdmin(user.id),
    listUserSessionsForAdmin(user.id),
    listUserSsoAccountsForAdmin({ userId: user.id }),
    listAdminAuditEvents({ target: { type: "user", id: user.id }, limit: 25 }),
    signUpScope
      ? listRiskAssessmentsForEmail(signUpScope, user.email, { event: "signup", limit: 1 })
      : [],
  ]);
  const isSelf = user.id === actor.userId;
  const isAdmin = (user.role ?? "").split(",").some((role) => role.trim() === "admin");
  // Owned organizations still running: a ban alone doesn't stop their API keys.
  const ownedOrganizations = memberships.filter(
    (m) => m.role.split(",").includes("owner") && !m.suspended,
  );
  const fields = { userId: user.id };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={user.email}
        meta={
          <>
            <PlatformRoleBadge role={user.role} />
            <UserStatusBadge banned={user.banned} />
          </>
        }
        title={user.name}
      />

      <Panel title="Account">
        <PanelBody flush>
          <SpecList columns={2}>
            <SpecItem label="User ID" mono>
              {user.id}
            </SpecItem>
            <SpecItem label="Created" mono>
              {formatDateTime(user.createdAt)}
            </SpecItem>
            <SpecItem label="Email">
              {user.emailVerified ? "Verified" : <Badge variant="warning">unverified</Badge>}
            </SpecItem>
            <SpecItem label="Two-factor">{user.twoFactorEnabled ? "On" : "Off"}</SpecItem>
            <SpecItem label="SSO">
              {ssoAccounts.length === 0
                ? "Not linked"
                : ssoAccounts
                    .map((account) => account.organization?.name ?? account.providerId)
                    .join(", ")}
            </SpecItem>
            <SpecItem label="Active sessions" mono>
              {sessions.length}
            </SpecItem>
            {user.banned ? (
              <>
                <SpecItem label="Ban reason">{user.banReason ?? "—"}</SpecItem>
                <SpecItem label="Ban expires" mono>
                  {user.banExpires ? formatDateTime(user.banExpires) : "Never"}
                </SpecItem>
              </>
            ) : null}
          </SpecList>
        </PanelBody>
      </Panel>

      {signUp ? (
        <Panel description="How coss.com Risk assessed this sign-up." title="Sign-up">
          <PanelBody flush>
            <SpecList columns={2}>
              <SpecItem label="Decision">
                <span className="flex items-center gap-2">
                  <RiskDecisionBadge decision={signUp.decision} />
                  <span className="font-mono text-muted-foreground text-xs">
                    {signUp.score.toFixed(2)}
                  </span>
                </span>
              </SpecItem>
              <SpecItem label="Assessed" mono>
                {formatDateTime(signUp.created_at)}
              </SpecItem>
              <SpecItem label="IP" mono>
                {signUp.ip ?? "—"}
                {signUp.signals.ip?.country ? ` · ${signUp.signals.ip.country}` : ""}
              </SpecItem>
              <SpecItem label="Network" mono>
                {[
                  signUp.signals.ip?.as_name ?? signUp.signals.ip?.asn,
                  signUp.signals.ip?.tor ? "Tor" : null,
                  signUp.signals.ip?.hosting_kind,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </SpecItem>
              <SpecItem label="Reported">
                {signUp.outcome ? <RiskOutcomeBadge outcome={signUp.outcome} /> : "Not yet"}
                {signUp.outcome !== "legitimate" &&
                (signUp.decision !== "allow" || signUp.outcome !== null) ? (
                  <AdminActionDialog
                    icon="signUp"
                    action={markSignUpLegitimateAction}
                    description="coss.com Risk takes back what reporting this sign-up remembered (its mailbox, device and network stop counting against later sign-ups) and resolves an open review. It doesn't unban the user or lift any suspension."
                    fields={{ assessmentId: signUp.id }}
                    reason="optional"
                    submitLabel="Mark legitimate"
                    success="Sign-up marked legitimate"
                    title="Mark this sign-up legitimate?"
                    triggerLabel="Mark legitimate"
                  />
                ) : null}
              </SpecItem>
              <SpecItem label="Reasons" stacked>
                {signUp.reasons.length > 0
                  ? signUp.reasons.map((reason) => reason.message).join(" · ")
                  : "None"}
              </SpecItem>
            </SpecList>
          </PanelBody>
        </Panel>
      ) : null}

      <Panel
        description={
          isSelf
            ? "This is your account. Another admin has to change it."
            : "Every action asks for a reason and is recorded in the audit log."
        }
        title="Controls"
      >
        {isSelf ? null : (
          <PanelBody className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {isAdmin && !signUpScope ? null : (
                <ReportAbuseDialog
                  email={user.email}
                  organizations={memberships.map((membership) => ({
                    id: membership.organization.id,
                    name: membership.organization.name,
                    role: membership.role,
                    suspended: membership.suspended,
                  }))}
                  signUpsAssessed={signUpScope !== null}
                  takeDownBlocked={
                    isAdmin
                      ? "Platform admins can't be taken down: remove the admin role first."
                      : null
                  }
                  user={{ id: user.id, banned: user.banned }}
                />
              )}
              {user.banned ? (
                <AdminActionDialog
                  icon="user"
                  action={unbanUserAction}
                  description={`${user.email} will be able to sign in again.`}
                  fields={fields}
                  reason="optional"
                  submitLabel="Unban"
                  success="User unbanned"
                  title="Unban this user?"
                  triggerLabel="Unban"
                />
              ) : (
                <AdminActionDialog
                  icon="user"
                  action={banUserAction}
                  description={`${user.email} is signed out everywhere and can't sign in. Nothing is reported to coss.com Risk, and their organizations' API keys keep working: use Take down & report for abuse.`}
                  destructive
                  fields={fields}
                  reason="required"
                  reasonPlaceholder="e.g. Spam complaints from …"
                  submitLabel="Ban user"
                  success="User banned and signed out"
                  title="Ban this user?"
                  triggerLabel="Ban"
                >
                  <Field>
                    <FieldLabel>Duration</FieldLabel>
                    <Select defaultValue="" items={BAN_DURATIONS} name="duration">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        {BAN_DURATIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </Field>
                </AdminActionDialog>
              )}
              <AdminActionDialog
                icon="role"
                action={setUserRoleAction}
                description={
                  isAdmin
                    ? `${user.email} loses access to this console.`
                    : `${user.email} gets full access to this console: every user and organization.`
                }
                destructive={!isAdmin}
                fields={{ ...fields, role: isAdmin ? "user" : "admin" }}
                reason="optional"
                submitLabel={isAdmin ? "Remove admin" : "Make admin"}
                success={isAdmin ? "Platform admin removed" : "Made platform admin"}
                title={isAdmin ? "Remove platform admin?" : "Make platform admin?"}
                triggerLabel={isAdmin ? "Remove admin" : "Make admin"}
              />
              <AdminActionDialog
                icon="user"
                action={impersonateUserAction}
                description={`You'll browse the dashboard as ${user.email} for up to an hour. You can't create live API keys while impersonating.`}
                disabled={user.banned || isAdmin}
                fields={fields}
                reason="required"
                reasonPlaceholder="e.g. Support ticket #1234"
                submitLabel="Impersonate"
                success={`Impersonating ${user.email}`}
                title="Impersonate this user?"
                triggerLabel="Impersonate"
              />
              {user.twoFactorEnabled ? (
                <AdminActionDialog
                  icon="twoFactor"
                  action={resetTwoFactorAction}
                  description={`${user.email}'s authenticator app and backup codes stop working and their password alone signs them in. Only do this after confirming their identity; organizations that require two-factor ask them to set it up again.`}
                  destructive
                  fields={fields}
                  reason="required"
                  reasonPlaceholder="e.g. Lost phone, identity confirmed in ticket #1234"
                  submitLabel="Reset two-factor"
                  success="Two-factor authentication reset"
                  title="Reset two-factor authentication?"
                  triggerLabel="Reset 2FA"
                />
              ) : null}
              {ssoAccounts.length > 0 ? (
                <AdminActionDialog
                  icon="sso"
                  action={unlinkUserSsoAction}
                  description={`${user.email}'s accounts are unlinked from their SSO providers and their SSO sessions end. Their next SSO sign-in links again, or they can set a password with “Forgot password”. Organizations that require SSO still ask for it: turn the requirement off on the organization if its identity provider is down.`}
                  destructive
                  fields={fields}
                  reason="required"
                  reasonPlaceholder="e.g. IdP account recreated, identity confirmed in ticket #1234"
                  submitLabel="Unlink SSO"
                  success="SSO accounts unlinked"
                  title="Unlink SSO accounts?"
                  triggerLabel="Unlink SSO"
                />
              ) : null}
              <AdminActionDialog
                icon="session"
                action={revokeUserSessionsAction}
                description={`Signs ${user.email} out on every device.`}
                disabled={sessions.length === 0}
                fields={fields}
                reason="optional"
                submitLabel="Sign out everywhere"
                success="Signed out of every session"
                title="Revoke every session?"
                triggerLabel="Revoke all sessions"
              />
            </div>
            {user.banned && ownedOrganizations.length > 0 ? (
              <p className="text-muted-foreground text-sm">
                This user owns {ownedOrganizations.length} active organization
                {ownedOrganizations.length === 1 ? "" : "s"}. A ban doesn't stop their API keys:
                Take down & report takes them down too.
              </p>
            ) : null}
            {isAdmin ? (
              <p className="text-muted-foreground text-sm">
                Admins can't be impersonated; remove the admin role first.
              </p>
            ) : null}
          </PanelBody>
        )}
      </Panel>

      <Panel title="Organizations">
        {memberships.length === 0 ? (
          <PanelBody className="text-muted-foreground text-sm">
            Not a member of any organization.
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.map((membership) => (
                <TableRow key={membership.memberId}>
                  <TableCell className="font-medium">
                    <Link
                      className="hover:underline"
                      href={`/admin/organizations/${membership.organization.id}`}
                    >
                      {membership.organization.name}
                    </Link>{" "}
                    <span className="font-mono text-muted-foreground text-xs">
                      /{membership.organization.slug}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{membership.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <OrganizationStatusBadge suspended={membership.suspended} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(membership.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title="Active sessions">
        {sessions.length === 0 ? (
          <PanelBody className="text-muted-foreground text-sm">No active sessions.</PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>IP address</TableHead>
                <TableHead>Device</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(session.createdAt)}
                    {session.impersonatedBy ? (
                      <Badge className="ms-2" variant="warning">
                        impersonation
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(session.expiresAt)}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {session.ipAddress ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-72 truncate text-muted-foreground">
                    {session.userAgent ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {isSelf ? null : (
                      <AdminActionDialog
                        icon="session"
                        action={revokeUserSessionAction}
                        description="Signs this device out."
                        fields={{ ...fields, sessionId: session.id }}
                        reason="optional"
                        submitLabel="Revoke session"
                        success="Session revoked"
                        title="Revoke this session?"
                        triggerLabel="Revoke"
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel description="Admin actions taken on this user, newest first." title="Admin activity">
        <AuditLogTable events={events} />
      </Panel>
    </div>
  );
}
