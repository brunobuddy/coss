"use server";

import { createProject, renameProject } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { requireOrgPermission } from "@/lib/session";

/** Creates a project (with production + development environments) and opens it. */
export async function createProjectAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      project: ["create"],
    });
    const name = formString(formData, "name");
    if (!name) throw new ActionError("Enter a project name.");
    const { project } = await createProject({ organizationId: organization.id, name });
    await recordAudit(session, {
      organizationId: organization.id,
      action: "project.created",
      target: { type: "project", id: project.id, label: project.name },
      projectId: project.id,
    });
    // The organization layout lists the projects (sidebar, breadcrumbs, ⌘K): without a refresh
    // the redirect keeps its old render, which doesn't know the new project.
    refresh();
    return `/${organization.slug}/${project.slug}/development`;
  });
  if (result.ok) redirect(result.data);
  return result;
}

/** Renames a project. Its slug (and so every URL) stays. */
export async function renameProjectAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      project: ["update"],
    });
    const name = formString(formData, "name");
    if (!name) throw new ActionError("Enter a project name.");
    // Scoped by organization: another organization's project id is not_found.
    const { previous, project } = await renameProject({
      organizationId: organization.id,
      projectId: formString(formData, "projectId"),
      name,
    });
    if (project.name !== previous.name) {
      await recordAudit(session, {
        organizationId: organization.id,
        action: "project.renamed",
        target: { type: "project", id: project.id, label: project.name },
        projectId: project.id,
        metadata: { name: { from: previous.name, to: project.name } },
      });
    }
    refresh();
    return null;
  });
}
