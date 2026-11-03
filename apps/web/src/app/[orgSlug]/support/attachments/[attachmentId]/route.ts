import { getCustomerAttachment } from "@coss/support";
import type { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/session";
import { supportDownloadResponse } from "@/lib/support-download";

/** A file on a ticket this member can see. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/[orgSlug]/support/attachments/[attachmentId]">,
) {
  const { orgSlug, attachmentId } = await ctx.params;
  const { organization, member, session } = await requireOrgMember(orgSlug);
  return supportDownloadResponse(
    await getCustomerAttachment(
      { organizationId: organization.id, userId: session.user.id, role: member.role },
      attachmentId,
    ),
  );
}
