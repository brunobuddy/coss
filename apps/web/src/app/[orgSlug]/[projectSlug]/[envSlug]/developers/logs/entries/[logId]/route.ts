import { getLogEntry, relatedLogEntries } from "@coss/logs";
import type { NextRequest } from "next/server";
import { requireLogsAccess } from "@/lib/logs";

/** One line and its timeline (same request or resource), for the explorer's drawer. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/developers/logs/entries/[logId]">,
) {
  const { logId, ...params } = await ctx.params;
  const { scope } = await requireLogsAccess(params);
  const entry = await getLogEntry(scope, logId);
  if (!entry) return Response.json({ error: "not_found" }, { status: 404 });
  const related = await relatedLogEntries(scope, entry);
  return Response.json({ entry, related }, { headers: { "Cache-Control": "no-store" } });
}
