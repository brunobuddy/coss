import { billingStateAt, usageByDay } from "@coss/billing";
import { PLANS } from "@coss/billing/catalog";
import { getHipaaImpact, getHipaaMode } from "@coss/compliance";
import {
  dedicatedIpCapacity,
  dedicatedIpPoolObject,
  getEmailTenant,
  listDomains,
} from "@coss/email";
import { listSendersForAdmin } from "@coss/email/admin";
import {
  BUCKET_NAMES,
  BUCKETS,
  type BucketName,
  describeRule,
  formatPeriod,
  type LimitRule,
  listRateLimitOverrides,
} from "@coss/ratelimit";
import { getOrganizationScim, listOrganizationMembers } from "@coss/tenancy";
import {
  getOrganizationForAdmin,
  getOrganizationSsoForAdmin,
  listAdminAuditEvents,
  listOrganizationApiKeysForAdmin,
  planOrganizationTakedown,
} from "@coss/tenancy/admin";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Field, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
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
import { AbuseCategoryField } from "@/components/admin/abuse-category-field";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { listHref } from "@/components/admin/list-controls";
import { AdminOrganizationTabs } from "@/components/admin/organization-tabs";
import { OrganizationStatusBadge } from "@/components/admin/status-badges";
import { SupportTicketsPanel } from "@/components/admin/support-tickets-panel";
import { StackedBars } from "@/components/charts/stacked-bars";
import { DomainStatusBadge } from "@/components/domain-badges";
import { PageHeader } from "@/components/page-header";
import {
  Panel,
  PanelAction,
  PanelBody,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { Stat, StatRow } from "@/components/stat-row";
import { abuseCategoryLabel } from "@/lib/abuse-categories";
import { planHas } from "@/lib/billing";
import { formatDateTime } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/session";
import { isSystemOrganization } from "@/lib/system-organization";
import {
  deleteOrganizationAdminAction,
  disableHipaaModeAction,
  disableOrganizationScimAction,
  disableOrganizationSsoAction,
  disableOrganizationSsoRequirementAction,
  enableHipaaModeAction,
  resetRateLimitOverrideAction,
  revokeApiKeyAction,
  setRateLimitOverrideAction,
  suspendOrganizationAction,
  takeDownOrganizationAction,
  unsuspendOrganizationAction,
} from "../../actions";

export const metadata: Metadata = { title: "Organization · Admin" };

const DAY_MS = 86_400_000;
const CHART_DAYS = 30;

const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** What each overridable bucket counts, in the console's words. */
const BUCKET_LABELS: Partial<Record<BucketName, string>> = {
  "api.read": "API reads, per key",
  "api.write": "API writes, per key",
  "api.send": "API send requests, per key",
  "api.mcp": "Hosted MCP server requests, per key",
  "risk.assess": "Risk assessments and lookups, per key",
  "risk.classify": "Risk content classifications per second, per organization",
  "risk.classify.day": "Risk content classifications per day, per organization",
  "risk.phone": "Risk phone checks per second, per organization",
  "risk.phone.day": "Risk phone checks per day, per organization",
  "risk.limit": "Risk rate limit checks, per key",
  "email.recipients.second": "Live recipients per second, per organization",
  "email.recipients.day": "Live recipients per day, per organization",
  "email.sandbox_recipients.day": "Sandbox recipients per day, per environment",
  "dashboard.invitations": "Member invitations per day, per organization",
  "dashboard.migration_connections": "Provider keys checked for imports per day, per organization",
  "hooks.messages.second": "Live Hooks messages per second, per organization",
  "hooks.deliveries.day": "Live Hooks deliveries per day (fan-out), per organization",
  "hooks.sandbox_deliveries.day": "Sandbox Hooks deliveries per day, per environment",
  "hooks.endpoint.attempts": "Hooks attempts per second, per endpoint (unless it sets its own)",
  "hooks.destination.attempts": "Hooks attempts per second, per destination host",
};

const OVERRIDABLE_BUCKETS = BUCKET_NAMES.filter((name) => BUCKETS[name].overridable);

export default async function AdminOrganizationPage({
  params,
}: PageProps<"/admin/organizations/[organizationId]">) {
  await requirePlatformAdmin();
  const { organizationId } = await params;
  const detail = await getOrganizationForAdmin(organizationId);
  if (!detail) notFound();
  const { organization, suspension, deletion } = detail;
  const now = new Date();
  const sendingSince = new Date(now.getTime() - 7 * DAY_MS);
  const chartStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (CHART_DAYS - 1) * DAY_MS,
  );
  const [
    members,
    keys,
    domains,
    tenant,
    sso,
    scim,
    rateLimits,
    { events },
    [sending],
    usage,
    takedown,
    dedicatedIps,
    capacity,
    hipaaMode,
    hipaaImpact,
    auditLogOnPlan,
  ] = await Promise.all([
    listOrganizationMembers({ organizationId: organization.id }),
    listOrganizationApiKeysForAdmin(organization.id),
    listDomains({ organizationId: organization.id }),
    getEmailTenant(organization.id),
    getOrganizationSsoForAdmin(organization.id),
    getOrganizationScim({ organizationId: organization.id }),
    listRateLimitOverrides(organization.id),
    listAdminAuditEvents({ organizationId: organization.id, limit: 25 }),
    listSendersForAdmin({ since: sendingSince, now, organizationId: organization.id }),
    usageByDay(organization.id, { start: chartStart, end: now }),
    planOrganizationTakedown(organization.id),
    dedicatedIpPoolObject(organization.id),
    dedicatedIpCapacity(),
    getHipaaMode(organization.id),
    getHipaaImpact(organization.id),
    planHas(organization.id, "auditLog"),
  ]);
  const billing = await billingStateAt(organization.id, now);
  const isSystem = await isSystemOrganization(organization.id);
  const banned = takedown.members.filter((member) => member.keptBecause === null);
  const kept = takedown.members.filter((member) => member.keptBecause !== null);
  const usageColumns = Array.from({ length: CHART_DAYS }, (_, index) => {
    const start = new Date(chartStart.getTime() + index * DAY_MS);
    const row = usage.find(
      (entry) => entry.meter === "email.recipients" && entry.day.getTime() === start.getTime(),
    );
    return { label: dayLabel.format(start), values: { recipients: row?.quantity ?? 0 } };
  });
  const fields = { organizationId: organization.id };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <PageHeader
          description={`created ${formatDateTime(organization.createdAt)}`}
          meta={
            <>
              <OrganizationStatusBadge
                deleting={deletion !== null}
                suspended={suspension !== null}
              />
              <Badge variant={billing.terms.plan === "free" ? "outline" : "secondary"}>
                {PLANS[billing.terms.plan].name}
              </Badge>
              <code className="font-mono text-xs">/{organization.slug}</code>
              <code className="font-mono text-xs">{organization.id}</code>
            </>
          }
          title={organization.name}
        />
        <AdminOrganizationTabs organizationId={organization.id} />
      </div>

      <Panel>
        <PanelHeader>
          <PanelTitle>HIPAA mode</PanelTitle>
          <PanelDescription>
            {hipaaMode
              ? `On since ${formatDateTime(hipaaMode.enabledAt)}. Agreement ${hipaaMode.baaReference}, signed ${hipaaMode.baaSignedAt.toISOString().slice(0, 10)}. A contract ending doesn't turn it off.`
              : "Turn this on once the organization's BAA is signed. Charge for it with a custom add-on on its contract."}
          </PanelDescription>
          <PanelAction>
            {hipaaMode ? (
              <AdminActionDialog
                icon="organization"
                action={disableHipaaModeAction}
                description="AI screening, tracking and content storage go back to what the organization's settings say for new messages, and staff can view its content again. Its two-factor requirement stays on. The change appears in its audit log."
                destructive
                fields={fields}
                reason="required"
                reasonPlaceholder="e.g. BAA ended, ticket #1234"
                submitLabel="Turn off HIPAA mode"
                success="HIPAA mode turned off"
                title={`Turn off HIPAA mode for ${organization.name}?`}
                triggerLabel="Turn off"
              />
            ) : isSystem ? null : (
              <AdminActionDialog
                icon="organization"
                action={enableHipaaModeAction}
                description="This turns off AI screening and tracking, discards live email content, requires two-factor authentication, limits SMS to US numbers and stops staff from viewing the organization's content. The change appears in its audit log."
                fields={fields}
                reason="required"
                reasonPlaceholder="e.g. Contract signed, ticket #1234"
                submitLabel="Turn on HIPAA mode"
                success="HIPAA mode turned on"
                title={`Turn on HIPAA mode for ${organization.name}?`}
                triggerLabel="Turn on"
              >
                <Field>
                  <FieldLabel>Date the BAA was signed</FieldLabel>
                  <Input name="baaSignedAt" required type="date" />
                </Field>
                <Field>
                  <FieldLabel>BAA reference</FieldLabel>
                  <Input name="baaReference" placeholder="e.g. BAA-2026-014" required />
                </Field>
                <div className="flex flex-col gap-2 text-sm">
                  <p className="font-medium">What this organization will notice</p>
                  <ul className="list-disc ps-5 text-muted-foreground">
                    <li>
                      {hipaaImpact.membersWithoutTwoFactor} of {members.length} members must set up
                      two-factor authentication, or sign in through the organization's SSO
                    </li>
                    <li>
                      {hipaaImpact.liveEnvironmentsTracking} live{" "}
                      {hipaaImpact.liveEnvironmentsTracking === 1
                        ? "environment loses"
                        : "environments lose"}{" "}
                      open and click tracking
                    </li>
                    <li>
                      {hipaaImpact.smsOutsideUsLast30Days} live{" "}
                      {hipaaImpact.smsOutsideUsLast30Days === 1 ? "SMS" : "SMS messages"} to numbers
                      outside the US in the last 30 days, which will be refused
                    </li>
                    <li>Every member signs in again the next time they open the organization</li>
                    {hipaaImpact.dedicatedPool ? (
                      <li>
                        Mail uses shared IPs until the dedicated pool requires TLS, usually within
                        minutes
                      </li>
                    ) : null}
                  </ul>
                  {auditLogOnPlan ? null : (
                    <p className="text-destructive-foreground">
                      The plan doesn't include the audit log, so this will be refused until the
                      contract grants it.
                    </p>
                  )}
                </div>
              </AdminActionDialog>
            )}
          </PanelAction>
        </PanelHeader>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Enforcement</PanelTitle>
          <PanelDescription>
            Three levers, from lightest to heaviest. Members never see an admin's reason.
            {isSystem
              ? " This is coss.com's own organization (it sends account emails), so none of them apply."
              : null}
          </PanelDescription>
          <PanelAction className="flex flex-wrap gap-2">
            {suspension ? (
              <AdminActionDialog
                icon="organization"
                action={unsuspendOrganizationAction}
                description="API keys that weren't revoked work again immediately and held webhook deliveries resume. Members banned by a takedown stay banned, and revoked keys stay revoked."
                fields={fields}
                reason="optional"
                submitLabel="Lift suspension"
                success="Account suspension lifted"
                title={`Lift the account suspension of ${organization.name}?`}
                triggerLabel="Lift account suspension"
              />
            ) : isSystem ? null : (
              <AdminActionDialog
                icon="organization"
                action={suspendOrganizationAction}
                description="Every API key is refused (403 organization_suspended), webhook deliveries are held, and members can only view the dashboard. Nothing is revoked or banned, and nothing is reported: use it while you investigate, or for a legal or billing hold."
                destructive
                fields={fields}
                reason="required"
                reasonPlaceholder="e.g. Investigating phishing reports, ticket #1234"
                submitLabel="Suspend account"
                success="Account suspended"
                title={`Suspend ${organization.name}'s account?`}
                triggerLabel="Suspend account"
              />
            )}
            {isSystem || deletion ? null : (
              <AdminActionDialog
                icon="organization"
                action={takeDownOrganizationAction}
                description={
                  <>
                    For confirmed abuse. Suspends the account
                    {takedown.suspended ? " (already suspended)" : ""}, revokes its{" "}
                    {takedown.apiKeys.length} API {takedown.apiKeys.length === 1 ? "key" : "keys"},
                    permanently bans the members who have nothing else on the platform, and reports
                    their sign-ups to coss.com Risk so the same mailbox, device and network are
                    flagged next time. Each step is recorded in the audit log.
                  </>
                }
                destructive
                fields={fields}
                reason="required"
                reasonPlaceholder="e.g. Phishing campaign, see /admin/emails"
                submitLabel="Take down and report"
                success="Organization taken down and reported"
                title={`Take down ${organization.name}?`}
                triggerLabel="Take down & report"
              >
                <AbuseCategoryField />
                <div className="flex flex-col gap-2 text-sm">
                  <p className="font-medium">Banned and reported ({banned.length})</p>
                  {banned.length > 0 ? (
                    <ul className="list-disc ps-5 text-muted-foreground">
                      {banned.map((member) => (
                        <li key={member.userId}>
                          {member.email} ({member.role})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Nobody.</p>
                  )}
                  {kept.length > 0 ? (
                    <>
                      <p className="font-medium">Kept ({kept.length})</p>
                      <ul className="list-disc ps-5 text-muted-foreground">
                        {kept.map((member) => (
                          <li key={member.userId}>
                            {member.email}: {member.keptBecause}
                          </li>
                        ))}
                      </ul>
                      <p className="text-muted-foreground">
                        To take down one of them as well, open them from Sign-ups or Users.
                      </p>
                    </>
                  ) : null}
                </div>
              </AdminActionDialog>
            )}
          </PanelAction>
        </PanelHeader>
        <PanelBody flush>
          <SpecList>
            <SpecItem label="Suspend live sending" stacked>
              Live sends are refused (account_suspended); sandbox and the dashboard keep working,
              and the customer is told by email, webhook and banner. For bounce, complaint or
              content problems with a customer you want to keep. On the{" "}
              <Link
                className="underline"
                href={`/admin/organizations/${organization.id}/reputation`}
              >
                Sending reputation
              </Link>{" "}
              tab; the worker also does this on its own. Undo: Reinstate.
            </SpecItem>
            <SpecItem label="Suspend account" stacked>
              Every API key refused (organization_suspended), webhooks held, dashboard read-only.
              Members see it's suspended, not why. For investigations and holds. Undo: Lift account
              suspension.
            </SpecItem>
            <SpecItem label="Take down & report" stacked>
              Suspend account, revoke every key, ban members with nothing else on coss.com, and
              report their sign-ups to coss.com Risk. For confirmed abuse. Lifting the suspension
              undoes only the suspension.
            </SpecItem>
          </SpecList>
        </PanelBody>
        {suspension ? (
          <PanelBody>
            <Alert variant="error">
              <AlertTitle className="flex items-center gap-2">
                Account suspended {formatDateTime(suspension.createdAt)}
                {suspension.category ? (
                  <Badge variant="error">{abuseCategoryLabel(suspension.category)}</Badge>
                ) : null}
              </AlertTitle>
              <AlertDescription>
                <p>{suspension.reason}</p>
                <p>
                  By{" "}
                  {suspension.suspendedByUserId ? (
                    <Link
                      className="underline"
                      href={`/admin/users/${suspension.suspendedByUserId}`}
                    >
                      {suspension.suspendedByEmail ?? suspension.suspendedByUserId}
                    </Link>
                  ) : (
                    "a removed admin"
                  )}
                </p>
              </AlertDescription>
            </Alert>
          </PanelBody>
        ) : null}
      </Panel>

      {deletion ? (
        <Alert variant="error">
          <AlertTitle>Being deleted since {formatDateTime(deletion.createdAt)}</AlertTitle>
          <AlertDescription>
            <p>
              Requested by {deletion.requestedByEmail}
              {deletion.byPlatformAdmin ? " (platform admin)" : ""}. Its members, invitations, API
              keys and SSO provider are gone; the worker is deleting its domains, SES tenant and
              data, then the organization.
            </p>
            {deletion.lastError ? (
              <p>
                Attempt {deletion.attemptCount} failed: {deletion.lastError}. It is retried
                automatically.
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <SupportTicketsPanel organizationId={organization.id} />

      <Panel
        action={
          <Button
            render={
              <Link href={listHref("/admin/emails", { org: organization.id, mode: "all" })} />
            }
            size="sm"
            variant="outline"
          >
            View emails
          </Button>
        }
        description="The last 7 days; the chart shows live recipients sent per day over 30 days."
        title="Sending"
      >
        <PanelBody className="flex flex-col gap-4">
          <StatRow>
            <Stat
              detail={`${sending?.liveRecipients ?? 0} recipients`}
              label="Live sent"
              value={sending?.liveSent ?? 0}
            />
            <Stat
              detail={`${sending?.livePending ?? 0} queued or scheduled`}
              label="Live failed"
              value={sending?.liveFailed ?? 0}
            />
            <Stat label="Sandbox" value={sending?.sandbox ?? 0} />
            <Stat
              detail={`${sending?.screeningBlocked ?? 0} blocked`}
              label="Screening flagged"
              value={sending?.screeningFlagged ?? 0}
            />
          </StatRow>
          <StackedBars
            columns={usageColumns}
            label="Live recipients sent per day"
            series={[
              { key: "recipients", label: "Live recipients", className: "bg-foreground/72" },
            ]}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle className="flex items-center gap-2">
            Dedicated IPs
            {dedicatedIps.status === "not_enabled" ? null : (
              <Badge variant="outline">{dedicatedIps.status}</Badge>
            )}
          </PanelTitle>
          <PanelDescription>
            {dedicatedIps.status === "not_enabled"
              ? "No dedicated IP pool (the Dedicated IPs add-on, on a contract or bought self-serve)."
              : `${dedicatedIps.ips.length} IP${dedicatedIps.ips.length === 1 ? "" : "s"}${dedicatedIps.ips.length ? ` (${dedicatedIps.ips.map((ip) => ip.ip).join(", ")})` : ""}; ${dedicatedIps.dedicated_share === null ? "too few deliveries to measure" : `${Math.round(dedicatedIps.dedicated_share * 100)}% of the last 7 days' deliveries from them`}.${dedicatedIps.message ? ` ${dedicatedIps.message}` : ""}`}{" "}
            Pools in use across COSS: {capacity.used} of {capacity.capacity}
            {capacity.waiting ? `, ${capacity.waiting} waiting` : ""}.
          </PanelDescription>
        </PanelHeader>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle className="flex items-center gap-2">
            Single sign-on
            {sso?.requireSso ? <Badge variant="outline">required</Badge> : null}
          </PanelTitle>
          <PanelDescription>
            {sso
              ? `${sso.type === "saml" ? "SAML" : "OIDC"} provider ${sso.providerId} for ${sso.domains}: ${sso.domainVerified ? "enabled" : "disabled"}. When members are locked out because the identity provider broke, turn the requirement off; disable the provider if it is compromised. Owners can always sign in with their password.`
              : "No SSO provider."}
          </PanelDescription>
          {sso ? (
            <PanelAction className="flex flex-wrap gap-2">
              {sso.requireSso ? (
                <AdminActionDialog
                  icon="sso"
                  action={disableOrganizationSsoRequirementAction}
                  description="Members can open the organization with any sign-in method again. SSO keeps working for those who can use it; the organization's owners can require it again."
                  fields={fields}
                  reason="required"
                  reasonPlaceholder="e.g. IdP outage, ticket #1234"
                  submitLabel="Stop requiring SSO"
                  success="SSO no longer required"
                  title={`Stop requiring SSO for ${organization.name}?`}
                  triggerLabel="Stop requiring SSO"
                />
              ) : null}
              {sso.domainVerified ? (
                <AdminActionDialog
                  icon="sso"
                  action={disableOrganizationSsoAction}
                  description="Nobody can sign in through this provider, and the SSO requirement is turned off. Its configuration is kept: saving it again in the organization's settings turns it back on."
                  destructive
                  fields={fields}
                  reason="required"
                  reasonPlaceholder="e.g. IdP compromised, reported in ticket #1234"
                  submitLabel="Disable SSO"
                  success="SSO disabled"
                  title={`Disable SSO for ${organization.name}?`}
                  triggerLabel="Disable SSO"
                />
              ) : null}
            </PanelAction>
          ) : null}
        </PanelHeader>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle className="flex items-center gap-2">
            Directory sync
            {scim ? (
              <Badge variant="outline">
                {scim.status === "active" ? "connected" : "disconnecting"}
              </Badge>
            ) : null}
          </PanelTitle>
          <PanelDescription>
            {scim
              ? `SCIM connection ${scim.connectionId}: ${scim.activeUsers} active and ${scim.inactiveUsers} deactivated users, ${scim.groups} groups. If the directory deprovisions people by mistake or a token leaked, disconnect it: tokens stop working at once and members stay.`
              : "No directory connected."}
          </PanelDescription>
          {scim ? (
            <PanelAction>
              <AdminActionDialog
                icon="directory"
                action={disableOrganizationScimAction}
                description="Every token of the organization's directory stops working and SSO no longer requires an active directory user. Members it provisioned stay. The organization's admins can connect a directory again."
                destructive
                fields={fields}
                reason="required"
                reasonPlaceholder="e.g. token leaked, reported in ticket #1234"
                submitLabel="Disconnect directory"
                success="Directory sync disconnected"
                title={`Disconnect directory sync for ${organization.name}?`}
                triggerLabel="Disconnect directory"
              />
            </PanelAction>
          ) : null}
        </PanelHeader>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Members</PanelTitle>
        </PanelHeader>
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  <Link className="hover:underline" href={`/admin/users/${member.user.id}`}>
                    {member.user.name}
                  </Link>
                </TableCell>
                <TableCell>{member.user.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{member.role}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(member.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>API keys</PanelTitle>
          <PanelDescription>
            Revoke a single key (e.g. one that leaked) without suspending the organization.
          </PanelDescription>
        </PanelHeader>
        {keys.length === 0 ? (
          <PanelBody className="text-muted-foreground text-sm">No API keys.</PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Project / environment</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name ?? "—"}</TableCell>
                  <TableCell>
                    <code className="text-xs">{key.start ? `${key.start}…` : "—"}</code>
                  </TableCell>
                  <TableCell>
                    {key.project.name} / {key.environment.name}{" "}
                    <Badge variant={key.environment.mode === "live" ? "info" : "outline"}>
                      {key.environment.mode}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(key.lastRequest)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(key.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <AdminActionDialog
                      icon="apiKey"
                      action={revokeApiKeyAction}
                      description="Requests using this key are rejected immediately. This can't be undone; the organization can create a new key."
                      destructive
                      fields={{ ...fields, keyId: key.id }}
                      reason="required"
                      reasonPlaceholder="e.g. Key published on GitHub"
                      submitLabel="Revoke key"
                      success="API key revoked"
                      title={`Revoke “${key.name ?? key.start ?? key.id}”?`}
                      triggerLabel="Revoke"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Email</PanelTitle>
          <PanelDescription>
            Provider tenant:{" "}
            {tenant ? (
              <>
                <code className="text-xs">{tenant.tenantName}</code> ({tenant.provider}), sending{" "}
                {tenant.sendingStatus}
                {tenant.statusCause ? ` — ${tenant.statusCause}` : ""}
              </>
            ) : (
              "none yet (created with the first domain)"
            )}
          </PanelDescription>
        </PanelHeader>
        {domains.length === 0 ? (
          <PanelBody className="text-muted-foreground text-sm">No domains.</PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell className="font-medium">{domain.name}</TableCell>
                  <TableCell>
                    <DomainStatusBadge status={domain.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(domain.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Rate limits</PanelTitle>
          <PanelDescription>
            Each bucket holds “burst” requests (or recipients) and refills “limit” per period.
            Changes apply within a minute and are kept in the admin audit log.
          </PanelDescription>
        </PanelHeader>
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>This organization</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {OVERRIDABLE_BUCKETS.map((bucket) => {
              const override = rateLimits[bucket];
              const rule: LimitRule = override ?? BUCKETS[bucket];
              return (
                <TableRow key={bucket}>
                  <TableCell>
                    <code className="text-xs">{bucket}</code>
                    <div className="text-muted-foreground text-xs">{BUCKET_LABELS[bucket]}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {describeRule(BUCKETS[bucket])}
                  </TableCell>
                  <TableCell>
                    {override ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {describeRule(override)} <Badge variant="info">override</Badge>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Default</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex gap-2">
                      <AdminActionDialog
                        icon="rateLimit"
                        action={setRateLimitOverrideAction}
                        description={
                          bucket === "email.recipients.second"
                            ? "A burst below 50 rejects emails with more recipients than the burst outright."
                            : `Default: ${describeRule(BUCKETS[bucket])}.`
                        }
                        fields={{ ...fields, bucket }}
                        reason="required"
                        reasonPlaceholder="e.g. Volume increase agreed in ticket #1234"
                        submitLabel="Save rate limit"
                        success={`${bucket} rate limit saved`}
                        title={`Change ${bucket} for ${organization.name}`}
                        triggerLabel="Change"
                      >
                        <div className="grid gap-4 sm:grid-cols-3">
                          <Field>
                            <FieldLabel>Limit</FieldLabel>
                            <Input
                              defaultValue={String(rule.limit)}
                              inputMode="numeric"
                              name="limit"
                              required
                            />
                          </Field>
                          <Field>
                            <FieldLabel>Per</FieldLabel>
                            <Input
                              defaultValue={formatPeriod(rule.periodMs)}
                              name="period"
                              required
                            />
                          </Field>
                          <Field>
                            <FieldLabel>Burst</FieldLabel>
                            <Input
                              defaultValue={rule.burst === undefined ? "" : String(rule.burst)}
                              inputMode="numeric"
                              name="burst"
                              placeholder="= limit"
                            />
                          </Field>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          Periods like 1s, 5m, 1h or 1d. An empty burst equals the limit.
                        </p>
                      </AdminActionDialog>
                      {override ? (
                        <AdminActionDialog
                          icon="rateLimit"
                          action={resetRateLimitOverrideAction}
                          description={`Back to ${describeRule(BUCKETS[bucket])}, within a minute.`}
                          fields={{ ...fields, bucket }}
                          reason="optional"
                          submitLabel="Reset to default"
                          success={`${bucket} reset to default`}
                          title={`Reset ${bucket} for ${organization.name}?`}
                          triggerLabel="Reset"
                        />
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      {deletion ? null : (
        <Panel>
          <PanelHeader>
            <PanelTitle>Deletion</PanelTitle>
            <PanelDescription>
              Deletes the organization, also while it is suspended (members can't). Members,
              invitations, API keys and the SSO provider go at once; the worker then releases its
              domains and SES tenant and deletes its data. The audit log keeps this entry.
            </PanelDescription>
            <PanelAction>
              <AdminActionDialog
                icon="organization"
                action={deleteOrganizationAdminAction}
                description="This can't be undone. Its domains become available to other organizations once they are released, and its phone numbers go back to the carrier, so port any it wants to keep first."
                destructive
                fields={fields}
                reason="required"
                reasonPlaceholder="e.g. Account closure requested in ticket #1234"
                submitLabel="Delete organization"
                success={{
                  title: `${organization.name} is being deleted`,
                  description: "The worker is removing its data.",
                }}
                title={`Delete ${organization.name}?`}
                triggerLabel="Delete"
              >
                <Field>
                  <FieldLabel>
                    Type <code className="font-mono">{organization.slug}</code> to confirm
                  </FieldLabel>
                  <Input autoComplete="off" name="confirm" required spellCheck={false} />
                </Field>
              </AdminActionDialog>
            </PanelAction>
          </PanelHeader>
        </Panel>
      )}

      <Panel>
        <PanelHeader>
          <PanelTitle>Admin activity</PanelTitle>
          <PanelDescription>Admin actions on this organization and its keys.</PanelDescription>
        </PanelHeader>
        <AuditLogTable events={events} />
      </Panel>
    </div>
  );
}
