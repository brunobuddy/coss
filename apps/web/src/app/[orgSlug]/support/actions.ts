"use server";

import {
  createDashboardTicket,
  reopenAsCustomer,
  replyAsCustomer,
  resolveAsCustomer,
} from "@coss/support";
import { newTicketSchema, supportBodySchema } from "@coss/support/schemas";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { requireOrgMember } from "@/lib/session";
import { attachmentIdsOf, refuseImpersonation, supportAuthor, supportDeps } from "@/lib/support";

// Not `requireOrgPermission`: a suspended or held organization must still be able to reach us.
async function member(formData: FormData) {
  const context = await requireOrgMember(formString(formData, "orgSlug"));
  refuseImpersonation(context.session);
  return {
    context,
    author: supportAuthor(context.session),
    scope: {
      organizationId: context.organization.id,
      userId: context.session.user.id,
      role: context.member.role,
    },
  };
}

/** Only a page of this organization is kept as where the ticket was raised from. */
function contextPath(value: string, orgSlug: string): string | undefined {
  return value.startsWith(`/${orgSlug}/`) && value.length <= 300 ? value : undefined;
}

export async function createTicketAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  let href = "";
  const result = await runAction(async () => {
    const { context, author } = await member(formData);
    const parsed = newTicketSchema.safeParse({
      subject: formString(formData, "subject"),
      category: formString(formData, "category"),
      severity: formString(formData, "severity") || "normal",
      body: formString(formData, "body"),
    });
    if (!parsed.success) {
      throw new ActionError(parsed.error.issues[0]?.message ?? "Check the form.");
    }
    const path = contextPath(formString(formData, "from"), context.organization.slug);
    const ticket = await createDashboardTicket(
      {
        organizationId: context.organization.id,
        organizationName: context.organization.name,
        author,
        ...parsed.data,
        attachmentIds: attachmentIdsOf(formData),
        context: path ? { path } : {},
      },
      supportDeps,
    );
    href = `/${context.organization.slug}/support/${ticket.id}`;
    return null;
  });
  if (result.ok) redirect(href);
  return result;
}

export async function replyToTicketAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { author, scope } = await member(formData);
    const body = supportBodySchema.safeParse(formString(formData, "body"));
    if (!body.success) throw new ActionError(body.error.issues[0]?.message ?? "Write a message.");
    await replyAsCustomer(
      {
        scope,
        ticketId: formString(formData, "ticketId"),
        author,
        body: body.data,
        attachmentIds: attachmentIdsOf(formData),
      },
      supportDeps,
    );
    refresh();
    return null;
  });
}

export async function resolveTicketAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { author, scope } = await member(formData);
    await resolveAsCustomer({ scope, ticketId: formString(formData, "ticketId"), author });
    refresh();
    return null;
  });
}

export async function reopenTicketAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { scope } = await member(formData);
    await reopenAsCustomer({ scope, ticketId: formString(formData, "ticketId") }, supportDeps);
    refresh();
    return null;
  });
}
