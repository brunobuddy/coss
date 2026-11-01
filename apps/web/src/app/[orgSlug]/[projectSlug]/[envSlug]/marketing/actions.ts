"use server";

import {
  cancelBroadcast,
  createBroadcast,
  deleteBroadcast,
  getBroadcastRow,
  pauseBroadcast,
  resumeBroadcast,
  sendBroadcast,
  testBroadcast,
  testRecipients,
  updateBroadcast,
} from "@coss/email";
import {
  CreateBroadcastRequest,
  SendBroadcastRequest,
  TestBroadcastRequest,
  UpdateBroadcastRequest,
} from "@coss/email/broadcast-schemas";
import { emailSendQuota } from "@coss/ratelimit";
import { getEnvironment, listVerifiedMemberEmails } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { liveProviderName, usageGate } from "@/lib/broadcasts";
import { emailService } from "@/lib/email-service";
import { auditMarketing, type MarketingTarget } from "@/lib/marketing";
import { rateLimitRuntime } from "@/lib/rate-limit";
import { type OrgContext, requireOrgPermission } from "@/lib/session";

type BroadcastAction = "create" | "update" | "delete" | "send";

/** The environment of the form's slugs, with what sends need (its project and mode). */
async function broadcastTarget(
  formData: FormData,
  permission: BroadcastAction,
): Promise<MarketingTarget & { send: { projectId: string; mode: "live" | "sandbox" } }> {
  const context: OrgContext = await requireOrgPermission(formString(formData, "orgSlug"), {
    broadcast: [permission],
  });
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return {
    context,
    env: { organizationId: context.organization.id, environmentId: found.environment.id },
    projectId: found.project.id,
    send: { projectId: found.project.id, mode: found.environment.mode },
  };
}

function listPath(formData: FormData, orgSlug: string): string {
  return `/${orgSlug}/${formString(formData, "projectSlug")}/${formString(formData, "envSlug")}/marketing`;
}

/** The first validation issue, named by its field. */
function issueMessage(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  const field = issue?.path.map(String).join(".");
  return `${field ? `${field}: ` : ""}${issue?.message ?? "Invalid value."}`;
}

/** The editor's fields as a request body (blank fields left out). */
function fieldsFromForm(formData: FormData) {
  const optional = (name: string) => formString(formData, name) || undefined;
  const target = formString(formData, "target");
  const replyTo = formString(formData, "replyTo")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const rate = formString(formData, "ratePerSecond");
  const html = formData.get("html");
  const text = formData.get("text");
  return {
    name: formString(formData, "name"),
    ...(target.startsWith("aud_") ? { audience_id: target } : {}),
    ...(target.startsWith("seg_") ? { segment_id: target } : {}),
    topic: optional("topic"),
    from: formString(formData, "from"),
    ...(replyTo.length ? { reply_to: replyTo } : {}),
    subject: formString(formData, "subject"),
    preview_text: optional("previewText"),
    // Bodies keep their whitespace.
    html: typeof html === "string" && html.trim() ? html : undefined,
    text: typeof text === "string" && text.trim() ? text : undefined,
    tracking: {
      opens: formData.get("trackOpens") === "on",
      clicks: formData.get("trackClicks") === "on",
    },
    ...(rate ? { rate_per_second: Number(rate) } : {}),
  };
}

/** Saves the draft (a new one, or the one named by `broadcastId`), then opens it. */
export async function saveBroadcastAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const broadcastId = formString(formData, "broadcastId");
    const target = await broadcastTarget(formData, broadcastId ? "update" : "create");
    const fields = fieldsFromForm(formData);
    let id: string;
    if (broadcastId) {
      const parsed = UpdateBroadcastRequest.safeParse({
        ...fields,
        audience_id: fields.audience_id ?? null,
        segment_id: fields.segment_id ?? null,
        topic: fields.topic ?? null,
        reply_to: fields.reply_to ?? [],
        preview_text: fields.preview_text ?? null,
        html: fields.html ?? null,
        text: fields.text ?? null,
        rate_per_second: fields.rate_per_second ?? null,
      });
      if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
      const updated = await updateBroadcast(target.env, broadcastId, parsed.data);
      if (!updated) throw new ActionError("Broadcast not found.");
      id = updated.id;
      await auditMarketing(target, {
        action: "broadcast.updated",
        target: { type: "broadcast", id, label: updated.name },
      });
    } else {
      const parsed = CreateBroadcastRequest.safeParse(fields);
      if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
      const { broadcast } = await createBroadcast(
        { ...target.env, ...target.send, apiKeyId: null },
        parsed.data,
        { liveProvider: liveProviderName() },
      );
      id = broadcast.id;
      await auditMarketing(target, {
        action: "broadcast.created",
        target: { type: "broadcast", id, label: broadcast.name },
      });
    }
    redirect(`${listPath(formData, target.context.organization.slug)}/${id}`);
  });
}

const UTC_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Starts sending the draft now, or at `scheduledAt` (a UTC `datetime-local` value). */
export async function sendBroadcastAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const target = await broadcastTarget(formData, "send");
    const local = formString(formData, "scheduledAt");
    if (local && !UTC_MINUTE.test(local)) throw new ActionError("Choose a date and time.");
    const parsed = SendBroadcastRequest.safeParse(local ? { scheduled_at: `${local}:00Z` } : {});
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
    const id = formString(formData, "broadcastId");
    const broadcast = await sendBroadcast({ ...target.env, ...target.send }, id, {
      scheduledAt: parsed.data.scheduled_at ? new Date(parsed.data.scheduled_at) : null,
      liveProvider: liveProviderName(),
    });
    if (!broadcast) throw new ActionError("Broadcast not found.");
    await auditMarketing(target, {
      action: "broadcast.sent",
      target: { type: "broadcast", id, label: broadcast.name },
    });
    refresh();
    return null;
  });
}

/** Pause, resume or cancel. */
export async function changeBroadcastAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const target = await broadcastTarget(formData, "send");
    const id = formString(formData, "broadcastId");
    const change = formString(formData, "change");
    const billing = await usageGate();
    const broadcast =
      change === "pause"
        ? await pauseBroadcast(target.env, id, { billing })
        : change === "cancel"
          ? await cancelBroadcast(target.env, id, { billing })
          : change === "resume"
            ? await resumeBroadcast({ ...target.env, ...target.send }, id, {
                liveProvider: liveProviderName(),
              })
            : null;
    if (!broadcast) throw new ActionError("Broadcast not found.");
    await auditMarketing(target, {
      action:
        change === "pause"
          ? "broadcast.paused"
          : change === "cancel"
            ? "broadcast.canceled"
            : "broadcast.resumed",
      target: { type: "broadcast", id, label: broadcast.name },
    });
    refresh();
    return null;
  });
}

export async function deleteBroadcastAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const target = await broadcastTarget(formData, "delete");
    const id = formString(formData, "broadcastId");
    const row = await getBroadcastRow(target.env, id);
    if (!row || !(await deleteBroadcast(target.env, id))) {
      throw new ActionError("Broadcast not found.");
    }
    await auditMarketing(target, {
      action: "broadcast.deleted",
      target: { type: "broadcast", id, label: row.name },
    });
    redirect(listPath(formData, target.context.organization.slug));
  });
}

/** Sends the broadcast's content to a few addresses (comma-separated). */
export async function testBroadcastAction(
  _previous: ActionResult<{ count: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const target = await broadcastTarget(formData, "send");
    // Test emails are sends: they need `email:send` too.
    await requireOrgPermission(target.context.organization.slug, { email: ["send"] });
    const parsed = TestBroadcastRequest.safeParse({
      to: formString(formData, "to")
        .split(/[\s,]+/)
        .filter(Boolean),
      contact: formString(formData, "contact") || undefined,
    });
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
    // Only the organization's own (verified) members, like template test sends: the dashboard is
    // no way to email anyone.
    const members = new Set(
      (await listVerifiedMemberEmails({ organizationId: target.env.organizationId })).map(
        (address) => address.toLowerCase(),
      ),
    );
    if (parsed.data.to.some((address) => !members.has(address.toLowerCase()))) {
      throw new ActionError("Test sends can only go to verified members of this organization.");
    }
    // Test emails count against the send quota, one per address, as they do through the API.
    const { limiter } = rateLimitRuntime();
    const auth = { ...target.env, mode: target.send.mode };
    const count = testRecipients(parsed.data.to).length;
    const decision = await limiter.consume(emailSendQuota(auth, count));
    if (!decision.allowed) {
      throw new ActionError("The send quota is used up for now. Try again in a moment.");
    }
    // Each email is its own send: what was accepted before a failure stays charged.
    let sent = 0;
    const refundUnsent = async () => {
      if (sent < count) await limiter.refund(emailSendQuota(auth, count - sent));
    };
    let ids: string[] | null;
    try {
      ids = await testBroadcast(
        { ...target.env, ...target.send, apiKeyId: null },
        formString(formData, "broadcastId"),
        parsed.data,
        {
          emailService: await emailService(),
          onSent: () => {
            sent++;
          },
        },
      );
    } catch (error) {
      await refundUnsent();
      throw error;
    }
    if (!ids) {
      await refundUnsent();
      throw new ActionError("Broadcast not found.");
    }
    return { count: ids.length };
  });
}
