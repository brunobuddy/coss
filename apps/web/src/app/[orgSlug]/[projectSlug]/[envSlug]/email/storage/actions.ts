"use server";

import { updateStorageSettings } from "@coss/email";
import { CONTENT_STORAGE_MODES, type ContentStorageMode } from "@coss/email/schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { requireOrgPermission } from "@/lib/session";

function isMode(value: string): value is ContentStorageMode {
  return (CONTENT_STORAGE_MODES as readonly string[]).includes(value);
}

/** Sets whether the environment keeps its emails' content once they are sent. */
export async function saveStorageSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      environment: ["update"],
    });
    const found = await getEnvironment({
      organizationId: context.organization.id,
      projectSlug: formString(formData, "projectSlug"),
      envSlug: formString(formData, "envSlug"),
    });
    if (!found) throw new ActionError("Environment not found.");
    const contentStorage = formString(formData, "contentStorage");
    if (!isMode(contentStorage)) throw new ActionError("Choose whether to store content.");
    const saved = await updateStorageSettings(
      { organizationId: context.organization.id, environmentId: found.environment.id },
      { contentStorage },
    );
    if (!saved) throw new ActionError("Environment not found.");
    await recordAudit(context.session, {
      action: "storage_settings.updated",
      organizationId: context.organization.id,
      projectId: found.project.id,
      environmentId: found.environment.id,
      target: { type: "environment", id: found.environment.id, label: found.environment.slug },
      metadata: { content_storage: contentStorage },
    });
    refresh();
    return null;
  });
}
