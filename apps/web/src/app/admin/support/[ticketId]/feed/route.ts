import { supportTicketFeed } from "@coss/support/admin";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/session";

/** What the open conversation polls: cheap, so the page re-renders only when something changed. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/admin/support/[ticketId]/feed">,
) {
  await requirePlatformAdmin();
  const { ticketId } = await ctx.params;
  return NextResponse.json(await supportTicketFeed(ticketId), {
    headers: { "Cache-Control": "no-store" },
  });
}
