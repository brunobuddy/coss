import { listRiskAssessments } from "@coss/risk";
import { ListRiskAssessmentsQuery } from "@coss/risk/schemas";
import { getEnvironment } from "@coss/tenancy";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { RiskDecisionBadge, RiskOutcomeBadge } from "@/components/risk-badges";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { ResolveButtons } from "./resolve-buttons";

export const metadata: Metadata = { title: "Risk" };

const PAGE_SIZE = 50;

/** The views above the table: each is a query string of `GET /v1/risk/assessments`. */
const VIEWS = [
  { id: "all", label: "All", query: {} },
  { id: "review", label: "Review queue", query: { review_status: "open" } },
  { id: "block", label: "Blocked", query: { decision: "block" } },
  { id: "allow", label: "Allowed", query: { decision: "allow" } },
] as const;

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export default async function RiskPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/risk">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const search = await searchParams;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ risk: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;

  const view = VIEWS.find((candidate) => candidate.id === single(search.view)) ?? VIEWS[0];
  const after = single(search.after);
  const query = ListRiskAssessmentsQuery.safeParse({ ...view.query, after, limit: PAGE_SIZE });
  const page = query.success
    ? await listRiskAssessments(
        { organizationId: organization.id, environmentId: environment.id },
        query.data,
      )
    : null;

  const base = `/${organization.slug}/${project.slug}/${environment.slug}`;
  const resolving = view.id === "review" && can({ risk: ["feedback"] });
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
  };
  const riskPath = `${base}/risk`;
  const viewPath = (id: string) => (id === "all" ? riskPath : `${riskPath}?view=${id}`);
  const last = page?.data.at(-1);
  const nextPage =
    page?.has_more && last
      ? `${riskPath}?${new URLSearchParams({ ...(view.id === "all" ? {} : { view: view.id }), after: last.id })}`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          can({ riskList: ["read"] }) ? (
            <Button render={<Link href={`${riskPath}/lists`} />} size="sm" variant="outline">
              Allow &amp; block lists
            </Button>
          ) : null
        }
        description="Every assessment of sign-ups, logins and other events made with this environment's API keys: the decision, its score and the reasons behind it. Reviews stay open until you report an outcome."
        meta={<ModeBadge mode={environment.mode} />}
        title="Risk assessments"
      />

      <FilterLinks
        options={VIEWS.map((candidate) => ({
          value: candidate.id,
          label: candidate.label,
          href: viewPath(candidate.id),
        }))}
        value={view.id}
      />

      <Panel
        footer={
          after || nextPage ? (
            <CursorPager
              newestHref={after ? viewPath(view.id) : undefined}
              olderHref={nextPage ?? undefined}
            />
          ) : null
        }
      >
        {!page || page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description={
                after
                  ? "You've reached the end of the list."
                  : view.id === "review"
                    ? "Assessments marked for review show up here until you report an outcome."
                    : "Call coss.risk.assess() from your sign-up or login flow."
              }
              icon={view.id === "review" ? ShieldCheckIcon : ShieldAlertIcon}
              title={
                after
                  ? "No more assessments"
                  : view.id === "review"
                    ? "Nothing to review"
                    : "No assessments yet"
              }
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Reasons</TableHead>
                {resolving ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((assessment) => (
                <TableRow key={assessment.id}>
                  <TableCell>
                    <Link
                      className="text-muted-foreground underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${riskPath}/${assessment.id}`}
                    >
                      {formatDateTime(assessment.created_at)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {assessment.event_name ?? assessment.event}
                  </TableCell>
                  <TableCell className="max-w-64 truncate font-medium">
                    {assessment.user.email ?? assessment.user.id ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <RiskDecisionBadge decision={assessment.decision} />
                      {assessment.outcome ? (
                        <RiskOutcomeBadge outcome={assessment.outcome} />
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {assessment.score.toFixed(2)}
                  </TableCell>
                  <TableCell className="max-w-80 truncate font-mono text-muted-foreground text-xs">
                    {assessment.reasons.map((reason) => reason.code).join(", ") || "—"}
                  </TableCell>
                  {resolving ? (
                    // Above the row's link, which covers the whole row.
                    <TableCell className="relative z-10">
                      <ResolveButtons {...target} assessmentId={assessment.id} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
