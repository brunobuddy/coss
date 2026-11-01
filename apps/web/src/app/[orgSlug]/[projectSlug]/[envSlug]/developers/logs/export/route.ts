import { type LogExportFormat, logExportStream } from "@coss/logs";
import type { NextRequest } from "next/server";
import { logViewFrom, requireLogsAccess } from "@/lib/logs";

const CONTENT_TYPES: Record<LogExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  ndjson: "application/x-ndjson; charset=utf-8",
};

/** The lines the explorer shows (same `q` and range), as CSV or NDJSON, newest first. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/developers/logs/export">,
) {
  const { scope, project, environment } = await requireLogsAccess(await ctx.params);
  const search = request.nextUrl.searchParams;
  const format: LogExportFormat = search.get("format") === "ndjson" ? "ndjson" : "csv";
  const view = logViewFrom(search);
  const stamp = view.to.toISOString().slice(0, 19).replaceAll(":", "");
  const filename = `logs-${project.slug}-${environment.slug}-${stamp}.${format}`;
  return new Response(
    logExportStream({ ...scope, from: view.from, to: view.to, filters: view.filters }, format),
    {
      headers: {
        "Content-Type": CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
