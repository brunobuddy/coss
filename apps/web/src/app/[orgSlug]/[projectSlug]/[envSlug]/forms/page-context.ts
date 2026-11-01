import "server-only";
import { getFormRow } from "@coss/forms";
import { getEnvironment } from "@coss/tenancy";
import { notFound } from "next/navigation";
import { requireOrgMember } from "@/lib/session";

/** Every Forms page: a member who can read forms, in an environment of the organization. */
export async function formsPageContext(params: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
}) {
  const { organization, can } = await requireOrgMember(params.orgSlug);
  if (!can({ form: ["read"] })) notFound();
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
    formsPath: `${envPath}/forms`,
    target: { orgSlug: organization.slug, projectSlug: project.slug, envSlug: environment.slug },
  };
}

/** A form page: the environment's form, or a 404. */
export async function formPageContext(params: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  formId: string;
}) {
  const context = await formsPageContext(params);
  const form = await getFormRow({
    organizationId: context.organization.id,
    environmentId: context.environment.id,
    formId: params.formId,
  });
  if (!form) notFound();
  return { ...context, form, formPath: `${context.formsPath}/${form.id}` };
}
