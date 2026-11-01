import { environmentsWithSentEmail } from "@coss/email";
import { getProject, listEnvironments } from "@coss/tenancy";
import { notFound, redirect } from "next/navigation";
import { defaultEnvironment, liveEnvironmentIds } from "@/lib/default-environment";
import { environmentPath } from "@/lib/navigation";
import { requireOrgMember } from "@/lib/session";

/**
 * A project has no page of its own: open its default environment (development until production
 * has sent an email).
 */
export default async function ProjectPage({ params }: PageProps<"/[orgSlug]/[projectSlug]">) {
  const { orgSlug, projectSlug } = await params;
  const { organization } = await requireOrgMember(orgSlug);
  const project = await getProject({ organizationId: organization.id, slug: projectSlug });
  if (!project) notFound();
  const environments = await listEnvironments({
    organizationId: organization.id,
    projectId: project.id,
  });
  const sent = await environmentsWithSentEmail({
    organizationId: organization.id,
    environmentIds: liveEnvironmentIds([{ environments }]),
  });
  const opens = defaultEnvironment(environments, sent);
  if (!opens) notFound();
  redirect(environmentPath(organization.slug, project.slug, opens.slug));
}
