"use server";

import type { SupportSeverity } from "@coss/billing/catalog";
import {
  acceptSuggestedCc,
  addSupportNote,
  assignSupportTicket,
  confirmSupportOrganization,
  deleteSavedReply,
  listSupportReps,
  markSupportNotSpam,
  markSupportSpam,
  replyAsAgent,
  requeueSupportIntake,
  revealSupportMessage,
  type SupportStatusChange,
  saveSavedReply,
  setSupportSeverity,
  setSupportStatus,
} from "@coss/support/admin";
import { supportBodySchema } from "@coss/support/schemas";
import { findOrganizationForAdmin, recordAdminAction } from "@coss/tenancy/admin";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { requirePlatformAdminAction } from "@/lib/session";
import { attachmentIdsOf, supportAuthor, supportDeps } from "@/lib/support";

const DAY = 24 * 60 * 60 * 1000;

async function rep() {
  const { actor, session } = await requirePlatformAdminAction();
  return { actor, author: supportAuthor(session) };
}

async function ticketAction(body: () => Promise<void>): Promise<ActionResult<null>> {
  return runAction(async () => {
    await body();
    refresh();
    return null;
  });
}

export async function writeToTicketAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor, author } = await rep();
    const ticketId = formString(formData, "ticketId");
    const parsed = supportBodySchema.safeParse(formString(formData, "body"));
    if (!parsed.success)
      throw new ActionError(parsed.error.issues[0]?.message ?? "Write a message.");
    const attachmentIds = attachmentIdsOf(formData);
    if (formString(formData, "mode") === "note") {
      await addSupportNote({ ticketId, author, body: parsed.data, attachmentIds });
      await recordAdminAction({
        actor,
        action: "support.note_added",
        target: { type: "support_ticket", id: ticketId },
      });
      return;
    }
    const after = formString(formData, "after");
    await replyAsAgent({
      ticketId,
      author,
      body: parsed.data,
      attachmentIds,
      lastSeenMessageId: formString(formData, "lastSeenMessageId") || undefined,
      after:
        after === "resolved"
          ? { status: "resolved" }
          : after === "snoozed"
            ? { status: "snoozed", snoozedUntil: new Date(Date.now() + DAY) }
            : { status: "pending" },
    });
    await recordAdminAction({
      actor,
      action: "support.replied",
      target: { type: "support_ticket", id: ticketId },
      metadata: { after: after || "pending" },
    });
  });
}

export async function assignTicketAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor, author } = await rep();
    const ticketId = formString(formData, "ticketId");
    const assigneeUserId = formString(formData, "assignee");
    const assignee =
      assigneeUserId === "none"
        ? null
        : (await listSupportReps()).find((item) => item.id === assigneeUserId);
    if (assignee === undefined) throw new ActionError("That person can't answer tickets.");
    await assignSupportTicket({
      ticketId,
      assigneeUserId: assignee?.id ?? null,
      assigneeName: assignee?.name ?? null,
      author,
    });
    await recordAdminAction({
      actor,
      action: "support.assigned",
      target: { type: "support_ticket", id: ticketId },
      metadata: { assignee_user_id: assignee?.id ?? null },
    });
  });
}

export async function setTicketSeverityAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor, author } = await rep();
    const ticketId = formString(formData, "ticketId");
    const severity = formString(formData, "severity");
    if (severity !== "normal" && severity !== "urgent") throw new ActionError("Choose a severity.");
    await setSupportSeverity(
      { ticketId, severity: severity as SupportSeverity, author },
      supportDeps,
    );
    await recordAdminAction({
      actor,
      action: "support.severity_changed",
      target: { type: "support_ticket", id: ticketId },
      metadata: { severity },
    });
  });
}

export async function setTicketStatusAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor, author } = await rep();
    const ticketId = formString(formData, "ticketId");
    const status = formString(formData, "status");
    let change: SupportStatusChange;
    if (status === "open" || status === "pending" || status === "resolved") change = { status };
    else if (status === "snoozed") {
      const days = Number(formString(formData, "days") || 1);
      change = { status, snoozedUntil: new Date(Date.now() + days * DAY) };
    } else throw new ActionError("Choose a status.");
    await setSupportStatus({ ticketId, change, author });
    await recordAdminAction({
      actor,
      action: "support.status_changed",
      target: { type: "support_ticket", id: ticketId },
      metadata: { status },
    });
  });
}

export async function markTicketSpamAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor, author } = await rep();
    const ticketId = formString(formData, "ticketId");
    if (formString(formData, "spam") === "no") {
      await markSupportNotSpam({ ticketId, author }, supportDeps);
    } else {
      await markSupportSpam({ ticketId, author });
    }
    await recordAdminAction({
      actor,
      action: "support.spam_changed",
      target: { type: "support_ticket", id: ticketId },
      metadata: { spam: formString(formData, "spam") !== "no" },
    });
  });
}

export async function confirmTicketOrganizationAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor, author } = await rep();
    const ticketId = formString(formData, "ticketId");
    const organization = await findOrganizationForAdmin(formString(formData, "organization"));
    if (!organization) throw new ActionError("No organization with this id or slug exists.");
    await confirmSupportOrganization(
      { ticketId, organizationId: organization.id, author },
      supportDeps,
    );
    await recordAdminAction({
      actor,
      action: "support.organization_confirmed",
      target: { type: "support_ticket", id: ticketId },
      organizationId: organization.id,
    });
  });
}

export async function revealTicketMessageAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor } = await rep();
    const messageId = formString(formData, "messageId");
    await revealSupportMessage({ messageId });
    await recordAdminAction({
      actor,
      action: "support.message_revealed",
      target: { type: "support_ticket", id: formString(formData, "ticketId") },
      metadata: { message_id: messageId },
    });
  });
}

export async function acceptTicketCcAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor, author } = await rep();
    const ticketId = formString(formData, "ticketId");
    const address = formString(formData, "address");
    await acceptSuggestedCc({ ticketId, address, author });
    await recordAdminAction({
      actor,
      action: "support.cc_added",
      target: { type: "support_ticket", id: ticketId },
      metadata: { address },
    });
  });
}

export async function saveSavedReplyAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor, author } = await rep();
    const title = formString(formData, "title");
    const body = supportBodySchema.safeParse(formString(formData, "body"));
    if (!title) throw new ActionError("Give it a title.");
    if (!body.success) throw new ActionError(body.error.issues[0]?.message ?? "Write a reply.");
    await saveSavedReply({ title, body: body.data, createdByUserId: author.userId });
    await recordAdminAction({
      actor,
      action: "support.saved_reply_changed",
      target: { type: "support_ticket", id: "saved-replies" },
      metadata: { title },
    });
  });
}

export async function deleteSavedReplyAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor } = await rep();
    const id = formString(formData, "id");
    await deleteSavedReply(id);
    await recordAdminAction({
      actor,
      action: "support.saved_reply_changed",
      target: { type: "support_ticket", id: "saved-replies" },
      metadata: { deleted: id },
    });
  });
}

export async function requeueSupportIntakeAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return ticketAction(async () => {
    const { actor } = await rep();
    const receivedEmailId = formString(formData, "receivedEmailId");
    await requeueSupportIntake(receivedEmailId);
    await recordAdminAction({
      actor,
      action: "support.intake_requeued",
      target: { type: "received_email", id: receivedEmailId },
    });
  });
}
