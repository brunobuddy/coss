import { logFacets, logHistogram, queryLogs } from "@coss/logs";
import { listEnvironmentApiKeys } from "@coss/tenancy";
import type { Metadata } from "next";
import { ModeBadge } from "@/components/email-badges";
import { LogExplorer } from "@/components/logs/log-explorer";
import { PageHeader } from "@/components/page-header";
import { logViewFrom, requireLogsAccess } from "@/lib/logs";

export const metadata: Metadata = { title: "Logs" };

const PAGE_SIZE = 100;

export default async function LogsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/developers/logs">) {
  const { organization, project, environment, scope } = await requireLogsAccess(await params);
  const search = await searchParams;
  const view = logViewFrom(search);
  const range = { from: view.from, to: view.to };

  const [page, histogram, facets, keys] = await Promise.all([
    queryLogs({ ...scope, ...range, filters: view.filters, limit: PAGE_SIZE }),
    logHistogram({ ...scope, ...range, filters: view.filters }),
    logFacets({ ...scope, ...range, filters: view.filters }),
    listEnvironmentApiKeys(scope),
  ]);
  const apiKeyNames = Object.fromEntries(keys.map((key) => [key.id, key.name ?? key.id]));
  const envPath = `/${organization.slug}/${project.slug}/${environment.slug}`;
  const selected = typeof search.log === "string" ? search.log : null;

  return (
    // `data-page-width="full"` lifts the shell's column cap: log lines need the room.
    <div className="flex flex-col gap-6" data-page-width="full">
      <PageHeader
        description="Every API request made with this environment's keys, every email event and every webhook delivery attempt. Kept for 30 days."
        meta={<ModeBadge mode={environment.mode} />}
        title="Logs"
      />
      <LogExplorer
        apiKeyNames={apiKeyNames}
        envPath={envPath}
        facets={facets}
        histogram={histogram}
        page={page}
        selected={selected}
        view={{
          q: view.q,
          preset: view.preset,
          from: view.from.toISOString(),
          to: view.to.toISOString(),
        }}
      />
    </div>
  );
}
