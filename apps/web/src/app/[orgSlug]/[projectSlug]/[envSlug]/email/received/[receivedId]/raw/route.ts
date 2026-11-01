import { getReceivedEmailRaw } from "@coss/email";
import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { downloadResponse, downloadScope } from "../../download";

/** The received email's raw message (`.eml`), as a download. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/email/received/[receivedId]/raw">,
) {
  const params = await ctx.params;
  const { scope, store } = await downloadScope(params);
  const raw = await getReceivedEmailRaw({ ...scope, id: params.receivedId }, store);
  if (!raw) notFound();
  return downloadResponse(raw.content, "message/rfc822", raw.filename);
}
