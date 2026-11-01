"use server";

import { deleteTrackingRule, upsertTrackingRule } from "@coss/email";
import { TrackingRuleInput } from "@coss/email/schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { type OrgContext, requireOrgPermission } from "@/lib/session";

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return { organizationId: context.organization.id, environmentId: found.environment.id };
}

/** Records a change to this environment's settings in the organization's audit log. */
async function audit(
  context: OrgContext,
  formData: FormData,
  input: {
    action: string;
    target?: { type: string; id: string | null; label?: string | null };
    metadata?: Record<string, unknown>;
  },
) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  await recordAudit(context.session, {
    ...input,
    organizationId: context.organization.id,
    projectId: found?.project.id ?? null,
    environmentId: found?.environment.id ?? null,
  });
}

/** Sets the environment default (no `category`) or the rule for one category. */
export async function saveTrackingRuleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      environment: ["update"],
    });
    const env = await environmentFromForm(context, formData);
    const parsed = TrackingRuleInput.safeParse({
      category: formString(formData, "category") || null,
      opens: formData.get("opens") === "on",
      clicks: formData.get("clicks") === "on",
      unsubscribe: formData.get("unsubscribe") === "on",
    });
    if (!parsed.success) {
      throw new ActionError(`Category: ${parsed.error.issues[0]?.message ?? "Invalid value."}`);
    }
    if (!(await upsertTrackingRule(env, parsed.data))) {
      throw new ActionError("Environment not found.");
    }
    await audit(context, formData, {
      action: "tracking_rule.saved",
      metadata: {
        category: parsed.data.category,
        opens: parsed.data.opens,
        clicks: parsed.data.clicks,
        unsubscribe: parsed.data.unsubscribe,
      },
    });
    refresh();
    return null;
  });
}

export async function deleteTrackingRuleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      environment: ["update"],
    });
    const env = await environmentFromForm(context, formData);
    // Scoped by environment (and so organization): another environment's rule is "not found".
    const ruleId = formString(formData, "ruleId");
    if (!(await deleteTrackingRule(env, ruleId))) {
      throw new ActionError("Rule not found.");
    }
    await audit(context, formData, {
      action: "tracking_rule.deleted",
      target: { type: "tracking_rule", id: ruleId },
    });
    refresh();
    return null;
  });
}
