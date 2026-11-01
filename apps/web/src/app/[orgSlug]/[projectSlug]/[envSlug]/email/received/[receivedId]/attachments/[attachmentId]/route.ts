import { getReceivedEmailAttachment } from "@coss/email";
import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { downloadResponse, downloadScope } from "../../../download";

/** One attachment of a received email, always as an opaque download. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/email/received/[receivedId]/attachments/[attachmentId]">,
) {
  const params = await ctx.params;
  const { scope, store } = await downloadScope(params);
  const attachment = await getReceivedEmailAttachment(
    { ...scope, id: params.receivedId, attachmentId: params.attachmentId },
    store,
  );
  if (!attachment) notFound();
  return downloadResponse(attachment.content, "application/octet-stream", attachment.filename);
}
