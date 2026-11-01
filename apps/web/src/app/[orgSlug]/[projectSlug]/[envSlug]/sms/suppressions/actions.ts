"use server";

import { addSmsSuppression, getSmsSuppression, removeSmsSuppression, SmsError } from "@coss/sms";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { type OrgContext, requireOrgPermission } from "@/lib/session";

async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return {
    organizationId: context.organization.id,
    projectId: found.project.id,
    environmentId: found.environment.id,
  };
}

export async function addSmsSuppressionAction(
  _previous: ActionResult<{ created: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ created: boolean }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      smsSuppression: ["create"],
    });
    const env = await environmentFromForm(context, formData);
    let result: Awaited<ReturnType<typeof addSmsSuppression>>;
    try {
      result = await addSmsSuppression(
        env,
        formString(formData, "phoneNumber").replace(/[\s()-]/g, ""),
      );
    } catch (error) {
      if (error instanceof SmsError) throw new ActionError(error.message);
      throw error;
    }
    if (result.created) {
      await recordAudit(context.session, {
        action: "sms_suppression.created",
        organizationId: env.organizationId,
        projectId: env.projectId,
        environmentId: env.environmentId,
        target: {
          type: "sms_suppression",
          id: result.suppression.id,
          label: result.suppression.phone_number,
        },
      });
    }
    refresh();
    return { created: result.created };
  });
}

export async function removeSmsSuppressionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      smsSuppression: ["delete"],
    });
    const env = await environmentFromForm(context, formData);
    const scope = { ...env, id: formString(formData, "suppressionId") };
    // Only an entry of this environment (and so of this organization) can be removed.
    const suppression = await getSmsSuppression(scope).catch(() => null);
    if (!suppression) throw new ActionError("Suppression not found.");
    await removeSmsSuppression(scope);
    await recordAudit(context.session, {
      action: "sms_suppression.deleted",
      organizationId: env.organizationId,
      projectId: env.projectId,
      environmentId: env.environmentId,
      target: { type: "sms_suppression", id: suppression.id, label: suppression.phone_number },
      metadata: { reason: suppression.reason },
    });
    refresh();
    return null;
  });
}
