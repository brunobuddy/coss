"use server";

import {
  createInbox,
  deleteInbox,
  deleteInboxThread,
  getInboxRow,
  type InboxRow,
  type InboxSendQuota,
  replyToInboxMessage,
  updateInbox,
} from "@coss/email";
import { CreateInboxRequest, UpdateInboxRequest } from "@coss/email/inbox-schemas";
import { emailSendQuota } from "@coss/ratelimit";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { planGate } from "@/lib/billing";
import { usageGate } from "@/lib/broadcasts";
import { emailRuntime } from "@/lib/email-runtime";
import { emailService } from "@/lib/email-service";
import { rateLimitRuntime } from "@/lib/rate-limit-runtime";
import { type OrgContext, requireOrgPermission } from "@/lib/session";

type InboxPermission = "create" | "update" | "delete" | "send";

async function contextFor(formData: FormData, action: InboxPermission) {
  return requireOrgPermission(formString(formData, "orgSlug"), { inbox: [action] });
}

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return found;
}

/** The inbox addressed by the form, checked to belong to that environment. */
async function inboxFromForm(context: OrgContext, formData: FormData) {
  const found = await environmentFromForm(context, formData);
  const inbox = await getInboxRow({
    organizationId: context.organization.id,
    environmentId: found.environment.id,
    id: formString(formData, "inboxId"),
  });
  if (!inbox) throw new ActionError("Inbox not found.");
  return { ...found, inbox };
}

function audit(
  context: OrgContext,
  inbox: Pick<InboxRow, "projectId" | "environmentId" | "id" | "address">,
  action: string,
  metadata?: Record<string, unknown>,
) {
  return recordAudit(context.session, {
    organizationId: context.organization.id,
    projectId: inbox.projectId,
    environmentId: inbox.environmentId,
    action,
    target: { type: "inbox", id: inbox.id, label: inbox.address },
    metadata,
  });
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export async function createInboxAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "create");
    const { project, environment } = await environmentFromForm(context, formData);
    const parsed = CreateInboxRequest.safeParse({
      username: formString(formData, "username").toLowerCase() || undefined,
      domain: formString(formData, "domain") || undefined,
      display_name: formString(formData, "displayName") || undefined,
      client_id: formString(formData, "clientId") || undefined,
    });
    if (!parsed.success) throw new ActionError(firstIssue(parsed.error));
    const { inbox, created } = await createInbox(
      {
        organizationId: context.organization.id,
        projectId: project.id,
        environmentId: environment.id,
        mode: environment.mode,
      },
      {
        username: parsed.data.username,
        domain: parsed.data.domain,
        displayName: parsed.data.display_name,
        clientId: parsed.data.client_id,
      },
      {
        managedDomain: emailRuntime().inbound?.managedDomain ?? null,
        plans: planGate(),
        billing: await usageGate(),
      },
    );
    if (!created) throw new ActionError("An inbox with this client ID already exists.");
    await audit(
      context,
      {
        projectId: project.id,
        environmentId: environment.id,
        id: inbox.id,
        address: inbox.address,
      },
      "inbox.created",
    );
    refresh();
    return { id: inbox.id };
  });
}

export async function updateInboxAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const { inbox } = await inboxFromForm(context, formData);
    const parsed = UpdateInboxRequest.safeParse({
      display_name: formString(formData, "displayName") || null,
    });
    if (!parsed.success) throw new ActionError(firstIssue(parsed.error));
    const updated = await updateInbox(
      { organizationId: context.organization.id, environmentId: inbox.environmentId, id: inbox.id },
      { displayName: parsed.data.display_name },
    );
    await audit(context, inbox, "inbox.updated", { display_name: updated.display_name });
    refresh();
    return null;
  });
}

export async function deleteInboxAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const context = await contextFor(formData, "delete");
    const { inbox } = await inboxFromForm(context, formData);
    const deleted = await deleteInbox(
      {
        organizationId: context.organization.id,
        environmentId: inbox.environmentId,
        id: inbox.id,
      },
      { billing: await usageGate() },
    );
    if (!deleted) throw new ActionError("Inbox not found.");
    await audit(context, inbox, "inbox.deleted");
    return null;
  });
  if (!result.ok) return result;
  redirect(
    `/${formString(formData, "orgSlug")}/${formString(formData, "projectSlug")}/${formString(formData, "envSlug")}/inboxes`,
  );
}

export async function deleteInboxThreadAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const context = await contextFor(formData, "delete");
    const { inbox } = await inboxFromForm(context, formData);
    const threadId = formString(formData, "threadId");
    const deleted = await deleteInboxThread({
      organizationId: context.organization.id,
      environmentId: inbox.environmentId,
      inboxId: inbox.id,
      id: threadId,
    });
    if (!deleted) throw new ActionError("Thread not found.");
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      projectId: inbox.projectId,
      environmentId: inbox.environmentId,
      action: "inbox_thread.deleted",
      target: { type: "inbox_thread", id: threadId },
      metadata: { inbox_id: inbox.id },
    });
    return null;
  });
  if (!result.ok) return result;
  redirect(
    `/${formString(formData, "orgSlug")}/${formString(formData, "projectSlug")}/${formString(formData, "envSlug")}/inboxes/${formString(formData, "inboxId")}`,
  );
}

const MAX_REPLY_LENGTH = 100_000;

/**
 * Replies to a message of the inbox from its address, like the API's reply: to the message's
 * sender (with everyone else on it for reply-all), charged to the environment's send quota.
 */
export async function replyToInboxMessageAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "send");
    const { project, environment, inbox } = await inboxFromForm(context, formData);
    const text = formString(formData, "text");
    if (!text) throw new ActionError("Write a reply.");
    if (text.length > MAX_REPLY_LENGTH) throw new ActionError("This reply is too long.");
    const sendEnvironment = {
      organizationId: context.organization.id,
      projectId: project.id,
      environmentId: environment.id,
      mode: environment.mode,
    };
    const { limiter } = rateLimitRuntime();
    let charged: ReturnType<typeof emailSendQuota> | null = null;
    const quota: InboxSendQuota = {
      async consume(recipients) {
        const request = emailSendQuota(sendEnvironment, recipients);
        const decision = await limiter.consume(request);
        if (!decision.allowed) {
          return {
            allowed: false,
            error: new ActionError(
              "The environment's send quota is used up for now. Try again later.",
            ),
          };
        }
        charged = request;
        return { allowed: true };
      },
      async refund() {
        if (charged) await limiter.refund(charged);
        charged = null;
      },
    };
    await replyToInboxMessage(await emailService(), {
      environment: sendEnvironment,
      apiKeyId: null,
      inboxId: inbox.id,
      messageId: formString(formData, "messageId"),
      request: { text, reply_all: formData.get("replyAll") === "on" },
      quota,
    });
    refresh();
    return null;
  });
}
