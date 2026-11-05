import { queryLogs } from "@coss/logs";
import type { NextRequest } from "next/server";
import { logViewFrom, requireLogsAccess } from "@/lib/logs";

const PAGE_SIZE = 100;
/** How far a live tail reaches back when the list is empty. */
const LIVE_LOOKBACK_MS = 60_000;
/** The most a live poll re-reads, whatever `since` says. */
const LIVE_MAX_WINDOW_MS = 10 * 60_000;
const LIVE_PAGE_SIZE = 500;

/**
 * More lines for the explorer: `?after=<id>` loads older ones (within the view's range), `?live=1`
 * the newest ones since `since` (an ISO time), newest first.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/developers/logs/feed">,
) {
  const { scope } = await requireLogsAccess(await ctx.params);
  const search = request.nextUrl.searchParams;
  const view = logViewFrom(search);
  const headers = { "Cache-Control": "no-store" };

  if (search.get("live") === "1") {
    const now = Date.now();
    const since = Date.parse(search.get("since") ?? "");
    const page = await queryLogs({
      ...scope,
      // The client re-reads a window behind its newest line: buffered request lines and late
      // events land with earlier timestamps than lines already shown. It merges by id.
      from: new Date(
        Number.isNaN(since) ? now - LIVE_LOOKBACK_MS : Math.max(since, now - LIVE_MAX_WINDOW_MS),
      ),
      // Producers' clocks drift a little; lines slightly in the future still show up.
      to: new Date(now + 60_000),
      filters: view.filters,
      limit: LIVE_PAGE_SIZE,
    });
    return Response.json(page, { headers });
  }

  const page = await queryLogs({
    ...scope,
    from: view.from,
    to: view.to,
    filters: view.filters,
    after: search.get("after") ?? undefined,
    limit: PAGE_SIZE,
  });
  return Response.json(page, { headers });
}
