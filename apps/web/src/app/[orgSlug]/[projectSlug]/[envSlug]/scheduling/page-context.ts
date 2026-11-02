import "server-only";
import { getEnvironment } from "@coss/tenancy";
import { notFound } from "next/navigation";
import { schedulingDeps } from "@/lib/scheduling";
import { requireOrgMember } from "@/lib/session";

/** Every Scheduling page: a member who can read it, in an environment of the organization. */
export async function schedulingPageContext(params: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
}) {
  const { organization, can } = await requireOrgMember(params.orgSlug);
  if (!can({ scheduling: ["read"] })) notFound();
  const deps = schedulingDeps();
  if (!deps) notFound();
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
    deps,
    project,
    environment,
    schedulingPath: `${envPath}/scheduling`,
    scope: { organizationId: organization.id, environmentId: environment.id },
    target: { orgSlug: organization.slug, projectSlug: project.slug, envSlug: environment.slug },
  };
}
