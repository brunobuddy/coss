import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { GitCommitHorizontalIcon, RocketIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import {
  CommitLink,
  CommitsTable,
  DeployRunStatus,
  shortSha,
  TRIGGER,
} from "@/components/admin/deploys";
import { AutoRefresh } from "@/components/auto-refresh";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import {
  DEPLOY_MAX_INTERVAL_MINUTES,
  DEPLOY_PHASES,
  DEPLOY_QUIET_MINUTES,
  DEPLOY_REFRESH_SECONDS,
} from "@/lib/deploy-runs";
import {
  type DeployOverview,
  deploysConfigured,
  GitHubError,
  getDeployOverview,
  redeployableCommits,
} from "@/lib/deploys";
import { formatDateTime, formatElapsed, formatRelative } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/session";
import { deployNowAction } from "./actions";
import { RedeployDialog } from "./redeploy-dialog";

export const metadata: Metadata = { title: "Deploys" };

/**
 * Production deploys: the commit production runs, main's commits it doesn't run yet and the
 * Deploy workflow's runs, with "Deploy now" (skip the batch wait) and redeploying an earlier
 * commit. Everything comes from GitHub through the coss.com Deploy app (`@/lib/deploys`); each
 * run links to its own page (`[runId]`). The page re-reads GitHub on its own while it is open.
 */
export default async function AdminDeploysPage() {
  await requirePlatformAdmin();
  const description = `Pushes to main ship in batches: ${DEPLOY_QUIET_MINUTES} minutes after the last push, or ${DEPLOY_MAX_INTERVAL_MINUTES} minutes after the previous deploy while pushes keep coming.`;

  if (!deploysConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader description={description} title="Deploys" />
        <Panel>
          <PanelBody flush>
            <EmptyState
              compact
              description="Set DEPLOY_GITHUB_APP_ID and DEPLOY_GITHUB_APP_PRIVATE_KEY for the coss.com Deploy GitHub App (README, “Deploying from the admin console”)."
              icon={RocketIcon}
              title="Deploys aren't set up"
            />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  let overview: DeployOverview;
  try {
    overview = await getDeployOverview();
  } catch (error) {
    if (!(error instanceof GitHubError)) throw error;
    return (
      <div className="flex flex-col gap-6">
        {/* Keeps trying: GitHub's hiccups are usually over in a minute. */}
        <PageHeader
          actions={
            <AutoRefresh
              renderedAt={new Date().toISOString()}
              seconds={DEPLOY_REFRESH_SECONDS.error}
            />
          }
          description={description}
          title="Deploys"
        />
        <Panel>
          <PanelBody flush>
            <EmptyState
              compact
              description={error.message}
              icon={TriangleAlertIcon}
              title="Couldn't read GitHub"
            />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  const now = new Date();
  const active = overview.runs.some((run) => DEPLOY_PHASES[run.phase].active);
  const redeployable = redeployableCommits(overview);
  const waiting = overview.pending.length;
  const waitingLabel = `${waiting}${overview.pendingTruncated ? "+" : ""} ${waiting === 1 ? "change" : "changes"}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {/* Follows runs without reloading: often while one moves, else slower. */}
            <AutoRefresh
              renderedAt={now.toISOString()}
              seconds={active ? DEPLOY_REFRESH_SECONDS.active : DEPLOY_REFRESH_SECONDS.idle}
            />
            <AdminActionDialog
              icon="deploy"
              action={deployNowAction}
              description={
                waiting > 0
                  ? `Builds main (${shortSha(overview.main)}, ${waitingLabel} production doesn't run yet) and rolls it out now, in about ten minutes. Push runs still waiting for their batch are canceled.`
                  : `Production already runs main (${shortSha(overview.main)}). This builds and rolls it out again, e.g. to pick up an environment change.`
              }
              fields={{}}
              reason="optional"
              submitLabel="Deploy now"
              success={{
                title: "Deploy started",
                description: "It appears under Runs in a few seconds.",
              }}
              title="Deploy main now?"
              triggerLabel="Deploy now"
            />
          </>
        }
        description={description}
        meta={
          overview.live ? (
            <>
              Production runs <CommitLink sha={overview.live} />
              {overview.live === overview.main
                ? " · up to date with main"
                : ` · ${waitingLabel} waiting`}
            </>
          ) : (
            "Production's commit is unknown (no recent deploy)."
          )
        }
        title="Deploys"
      />

      <Panel description="Main's merges production doesn't run yet, newest first." title="Waiting">
        {waiting === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Everything on main is in production."
              icon={GitCommitHorizontalIcon}
              title="Nothing waiting"
            />
          </PanelBody>
        ) : (
          <CommitsTable commits={overview.pending} now={now} />
        )}
      </Panel>

      <Panel description="The Deploy workflow's latest runs on GitHub." title="Runs">
        {overview.runs.length === 0 ? (
          <PanelBody flush>
            <EmptyState compact icon={RocketIcon} title="No runs yet" />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell
                    className="whitespace-nowrap text-muted-foreground"
                    title={formatDateTime(run.createdAt)}
                  >
                    {formatRelative(run.createdAt, now)}
                  </TableCell>
                  <TableCell className="max-w-96">
                    <div className="truncate">
                      <Link
                        className="font-medium hover:underline"
                        href={`/admin/deploys/${run.id}`}
                      >
                        {run.title}
                      </Link>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {TRIGGER[run.trigger]}
                      {run.actor ? ` by ${run.actor}` : ""} ·{" "}
                      {run.commit ? <CommitLink sha={run.commit} /> : "an earlier commit"}
                      {run.commit === overview.live ? " · running now" : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DeployRunStatus now={now} run={run} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {run.durationMs === null || run.phase === "waiting"
                      ? "—"
                      : formatElapsed(run.durationMs)}
                  </TableCell>
                  <TableCell className="text-right">
                    {run.commit && redeployable.has(run.commit) ? (
                      <RedeployDialog commit={run.commit} />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
