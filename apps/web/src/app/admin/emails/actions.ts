"use server";

import { isId } from "@coss/db/id";
import { getEmailContentForAdmin, getEmailForAdmin } from "@coss/email/admin";
import { recordAdminAction } from "@coss/tenancy/admin";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { requirePlatformAdminAction } from "@/lib/session";

export type EmailContent = { html: string | null; text: string | null };

/**
 * A customer email's content, for a platform admin looking into abuse. Every view is recorded in
 * the admin audit log (never in the organization's own: that would tell a spammer they're watched).
 */
export async function revealEmailContentAction(
  _previous: ActionResult<EmailContent> | null,
  formData: FormData,
): Promise<ActionResult<EmailContent>> {
  return runAction(async () => {
    const { actor } = await requirePlatformAdminAction();
    const emailId = formString(formData, "emailId");
    if (!isId("email", emailId)) throw new ActionError("Email not found.");
    const context = await getEmailForAdmin(emailId);
    if (context?.hipaaMode) {
      throw new ActionError("This organization is in HIPAA mode, so staff can't view its content.");
    }
    const content = context && (await getEmailContentForAdmin(emailId));
    if (!context || !content) throw new ActionError("Email not found. It may have been purged.");
    await recordAdminAction({
      actor,
      action: "email.view_content",
      target: { type: "email", id: emailId },
      organizationId: content.organizationId,
      metadata: { slug: context.organizationSlug },
    });
    return { html: content.html, text: content.text };
  });
}
