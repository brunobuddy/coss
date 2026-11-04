"use server";

import { createFirstProject } from "@coss/tenancy";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { requireOrgPermission } from "@/lib/session";

/** An organization's first project, so a new owner has an environment and API keys at once. */
export async function createFirstProjectAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      project: ["create"],
    });
    const created = await createFirstProject({ organizationId: organization.id });
    if (created) {
      await recordAudit(session, {
        organizationId: organization.id,
        action: "project.created",
        target: { type: "project", id: created.project.id, label: created.project.name },
        projectId: created.project.id,
      });
    }
    refresh();
    return null;
  });
}
