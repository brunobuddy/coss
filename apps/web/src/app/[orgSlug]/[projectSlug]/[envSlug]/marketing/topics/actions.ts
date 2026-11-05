"use server";

import { createTopic, deleteTopic, getTopic, updateTopic } from "@coss/email";
import { CreateTopicRequest, UpdateTopicRequest } from "@coss/email/contact-schemas";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { auditMarketing, marketingTargetFromForm } from "@/lib/marketing";
import { requireOrgPermission } from "@/lib/session";

function topicFields(formData: FormData) {
  const position = formString(formData, "position");
  return {
    name: formString(formData, "name"),
    description: formString(formData, "description") || null,
    default_subscription: formString(formData, "defaultSubscription"),
    visibility: formString(formData, "visibility"),
    ...(position ? { position: Number(position) } : {}),
  };
}

function issueMessage(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  return `${issue?.path.join(".") || "Topic"}: ${issue?.message ?? "Invalid value."}`;
}

/** Creates a topic, or updates the one named by `topicId` (its key can't change). */
export async function saveTopicAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const topicId = formString(formData, "topicId");
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: [topicId ? "update" : "create"],
    });
    const target = await marketingTargetFromForm(context, formData);
    if (topicId) {
      const parsed = UpdateTopicRequest.safeParse(topicFields(formData));
      if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
      const topic = await updateTopic(target.env, topicId, parsed.data);
      if (!topic) throw new ActionError("Topic not found.");
      await auditMarketing(target, {
        action: "topic.updated",
        target: { type: "topic", id: topic.id, label: topic.key },
      });
    } else {
      const parsed = CreateTopicRequest.safeParse({
        key: formString(formData, "key"),
        ...topicFields(formData),
      });
      if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
      const topic = await createTopic(target.env, parsed.data);
      await auditMarketing(target, {
        action: "topic.created",
        target: { type: "topic", id: topic.id, label: topic.key },
      });
    }
    refresh();
    return null;
  });
}

export async function deleteTopicAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["delete"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const id = formString(formData, "topicId");
    const topic = await getTopic(target.env, id);
    if (!topic || !(await deleteTopic(target.env, id))) throw new ActionError("Topic not found.");
    await auditMarketing(target, {
      action: "topic.deleted",
      target: { type: "topic", id, label: topic.key },
    });
    refresh();
    return null;
  });
}
