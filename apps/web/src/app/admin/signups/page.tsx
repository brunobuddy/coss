import { listRiskAssessments } from "@coss/risk";
import { ListRiskAssessmentsQuery } from "@coss/risk/schemas";
import {
  type AdminUserSummary,
  listUsersForAdmin,
  usersByEmailForAdmin,
} from "@coss/tenancy/admin";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { UserPlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { listHref, stringParam } from "@/components/admin/list-controls";
import { UserStatusBadge } from "@/components/admin/status-badges";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { RiskDecisionBadge, RiskOutcomeBadge } from "@/components/risk-badges";
import { formatDateTime, formatRelative } from "@/lib/format";
import { signUpRiskScope } from "@/lib/risk";
import { requirePlatformAdmin } from "@/lib/session";
import { markSignUpLegitimateAction } from "../actions";
import { ReportAbuseDialog } from "../report-abuse-dialog";

export const metadata: Metadata = { title: "Sign-ups" };

const PAGE_SIZE = 50;

const VIEWS = [
  { value: "all", label: "All" },
  { value: "block", label: "Blocked" },
  { value: "review", label: "Review" },
  { value: "allow", label: "Allowed" },
] as const;

function Organizations({ user }: { user: AdminUserSummary }) {
  if (user.organizations.length === 0) {
    return <span className="text-muted-foreground">none</span>;
  }
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {user.organizations.map((organization) => (
        <span className="inline-flex items-center gap-1" key={organization.id}>
          <Link className="hover:underline" href={`/admin/organizations/${organization.id}`}>
            {organization.name}
          </Link>
          {organization.suspended ? <Badge variant="error">suspended</Badge> : null}
        </span>
      ))}
    </span>
  );
}

/**
 * coss.com's own sign-ups as coss.com Risk assessed them (`RISK_SIGNUP_ENVIRONMENT_ID`), with the account
 * each one became. Refused sign-ups have no account.
 */
export default async function AdminSignUpsPage({ searchParams }: PageProps<"/admin/signups">) {
  await requirePlatformAdmin();
  const search = await searchParams;
  const scope = await signUpRiskScope();
  const now = new Date();

  if (!scope) {
    const { users } = await listUsersForAdmin({ limit: PAGE_SIZE });
    return (
      <div className="flex flex-col gap-6">
        <PageHeader description="The newest accounts." title="Sign-ups" />
        <Alert variant="warning">
          <AlertTitle>Sign-ups aren't assessed</AlertTitle>
          <AlertDescription>
            Set RISK_SIGNUP_ENVIRONMENT_ID to a live environment of coss.com's own organization to
            score every sign-up with coss.com Risk (disposable and undeliverable addresses, IP
            reputation, velocity, duplicate mailboxes) and list the decisions here.
          </AlertDescription>
        </Alert>
        <Panel>
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Signed up</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell
                    className="whitespace-nowrap text-muted-foreground"
                    title={formatDateTime(user.createdAt)}
                  >
                    {formatRelative(user.createdAt, now)}
                  </TableCell>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`/admin/users/${user.id}`}>
                      {user.email}
                    </Link>
                    {user.emailVerified ? null : (
                      <Badge className="ms-2" variant="outline">
                        unverified
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <UserStatusBadge banned={user.banned} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    );
  }

  const view = VIEWS.find((option) => option.value === stringParam(search.view)) ?? VIEWS[0];
  const after = stringParam(search.after) || undefined;
  const query = ListRiskAssessmentsQuery.safeParse({
    event: "signup",
    ...(view.value === "all" ? {} : { decision: view.value }),
    after,
    limit: PAGE_SIZE,
  });
  const page = query.success
    ? await listRiskAssessments(scope, query.data)
    : { data: [], has_more: false };
  const users = await usersByEmailForAdmin(
    page.data.flatMap((assessment) => (assessment.user.email ? [assessment.user.email] : [])),
  );
  const viewParam = view.value === "all" ? undefined : view.value;
  const last = page.data.at(-1);

  return (
    <div className="flex flex-col gap-6" data-page-width="full">
      <PageHeader
        description="Every sign-up as coss.com Risk assessed it, newest first. Blocked sign-ups were refused and have no account; the address, IP and user agent are kept for 90 days. Report abuse here (or take the account down with it) so Risk flags the same mailbox, device and network next time; mark false positives legitimate."
        title="Sign-ups"
      />
      <FilterLinks
        options={VIEWS.map((option) => ({
          value: option.value,
          label: option.label,
          href: listHref("/admin/signups", {
            view: option.value === "all" ? undefined : option.value,
          }),
        }))}
        value={view.value}
      />
      <Panel>
        {page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="No sign-up matches this view."
              icon={UserPlusIcon}
              title="No sign-ups"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Sign-up</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Reasons</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Organizations</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((assessment) => {
                const email = assessment.user.email;
                const user = email ? users.get(email.toLowerCase()) : undefined;
                const ip = assessment.signals.ip;
                const reported = assessment.outcome === "fraud" || assessment.outcome === "abuse";
                const canReport = !reported || (user !== undefined && !user.banned);
                const canMarkLegitimate =
                  assessment.outcome !== "legitimate" &&
                  (assessment.decision !== "allow" || reported);
                return (
                  <TableRow key={assessment.id}>
                    <TableCell className="max-w-64">
                      <span className="block truncate font-medium" title={email ?? ""}>
                        {user ? (
                          <Link className="hover:underline" href={`/admin/users/${user.id}`}>
                            {email}
                          </Link>
                        ) : (
                          (email ?? <span className="text-muted-foreground">forgotten</span>)
                        )}
                      </span>
                      <span
                        className="block text-muted-foreground text-xs"
                        title={formatDateTime(assessment.created_at)}
                      >
                        {formatRelative(assessment.created_at, now)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <RiskDecisionBadge decision={assessment.decision} />
                        <span className="font-mono text-muted-foreground text-xs">
                          {assessment.score.toFixed(2)}
                        </span>
                      </span>
                      {assessment.outcome ? (
                        <span
                          className="mt-1 flex items-center gap-1 text-muted-foreground text-xs"
                          title="The outcome reported to coss.com Risk"
                        >
                          reported <RiskOutcomeBadge outcome={assessment.outcome} />
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-64 max-w-96 whitespace-normal text-sm">
                      {assessment.reasons.length > 0
                        ? assessment.reasons.map((reason) => reason.message).join(" · ")
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {assessment.ip ?? "—"}
                      {ip?.country ? (
                        <span className="text-muted-foreground"> · {ip.country}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {user ? (
                        <UserStatusBadge banned={user.banned} />
                      ) : (
                        <span className="text-muted-foreground">
                          {assessment.decision === "block" ? "refused" : "none"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{user ? <Organizations user={user} /> : null}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="flex flex-col items-end gap-2">
                        {canMarkLegitimate ? (
                          <AdminActionDialog
                            action={markSignUpLegitimateAction}
                            description="coss.com Risk takes back what reporting this sign-up remembered (its mailbox, device and network stop counting against later sign-ups) and resolves an open review. It doesn't unban anyone or lift a suspension."
                            fields={{ assessmentId: assessment.id }}
                            reason="optional"
                            submitLabel="Mark legitimate"
                            success="Sign-up marked legitimate"
                            title={`Mark ${email ?? "this sign-up"} legitimate?`}
                            triggerLabel="Legitimate"
                          />
                        ) : null}
                        {canReport ? (
                          <ReportAbuseDialog
                            assessmentId={assessment.id}
                            email={email}
                            organizations={user?.organizations ?? []}
                            signUpsAssessed
                            user={user ? { id: user.id, banned: user.banned } : null}
                          />
                        ) : null}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
      <CursorPager
        newestHref={after ? listHref("/admin/signups", { view: viewParam }) : undefined}
        olderHref={
          page.has_more && last
            ? listHref("/admin/signups", { view: viewParam, after: last.id })
            : undefined
        }
        summary={`${page.data.length} sign-ups`}
      />
    </div>
  );
}
