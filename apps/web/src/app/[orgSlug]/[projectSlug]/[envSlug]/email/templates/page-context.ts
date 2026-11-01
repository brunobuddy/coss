import "server-only";
import { getEnvironment } from "@coss/tenancy";
import { notFound } from "next/navigation";
import { environmentPath } from "@/lib/navigation";
import { requireOrgMember } from "@/lib/session";

/** Every template page: a member who can read templates, in an environment of the organization. */
export async function templatePageContext(params: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
}) {
  const { organization, can, session } = await requireOrgMember(params.orgSlug);
  if (!can({ emailTemplate: ["read"] })) notFound();
  const found = await getEnvironment({
    organizationId: organization.id,
    projectSlug: params.projectSlug,
    envSlug: params.envSlug,
  });
  if (!found) notFound();
  const { project, environment } = found;
  const envPath = environmentPath(organization.slug, project.slug, environment.slug);
  return {
    organization,
    can,
    session,
    project,
    environment,
    envPath,
    templatesPath: `${envPath}/email/templates`,
    scope: { organizationId: organization.id, environmentId: environment.id },
    target: { orgSlug: organization.slug, projectSlug: project.slug, envSlug: environment.slug },
  };
}
