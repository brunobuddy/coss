import "server-only";
import { getEnvironment } from "@coss/tenancy";
import { notFound } from "next/navigation";
import { requireOrgMember } from "@/lib/session";

/** Every Hooks page: a member who can read Hooks, in an environment of the organization. */
export async function hookPageContext(params: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
}) {
  const { organization, can } = await requireOrgMember(params.orgSlug);
  if (!can({ hook: ["read"] })) notFound();
  const found = await getEnvironment({
    organizationId: organization.id,
    projectSlug: params.projectSlug,
    envSlug: params.envSlug,
  });
  if (!found) notFound();
  const { project, environment } = found;
  const envPath = `/${organization.slug}/${project.slug}/${environment.slug}`;
  return {
    organization,
    can,
    project,
    environment,
    envPath,
    hooksPath: `${envPath}/hooks`,
    target: { orgSlug: organization.slug, projectSlug: project.slug, envSlug: environment.slug },
  };
}

export const DELIVERY_STATUS = {
  pending: ["warning", "Pending"],
  succeeded: ["success", "Succeeded"],
  failed: ["error", "Failed"],
} as const;
