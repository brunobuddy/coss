import { getSupportAttachmentForRep } from "@coss/support/admin";
import { recordAdminAction } from "@coss/tenancy/admin";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/session";
import { supportDownloadResponse } from "@/lib/support-download";

/** A file on a ticket, for a rep. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/admin/support/attachments/[attachmentId]">,
) {
  const { actor } = await requirePlatformAdmin();
  const { attachmentId } = await ctx.params;
  const attachment = await getSupportAttachmentForRep(attachmentId);
  if (attachment?.ticketId) {
    await recordAdminAction({
      actor,
      action: "support.attachment_downloaded",
      target: { type: "support_ticket", id: attachment.ticketId },
      metadata: { attachment_id: attachment.id },
    });
  }
  return supportDownloadResponse(attachment);
}
