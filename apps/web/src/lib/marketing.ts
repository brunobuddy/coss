import "server-only";
import { type ContactEnvironment, listAudiences } from "@coss/email";
import { getEnvironment } from "@coss/tenancy";
import { notFound } from "next/navigation";
import { ActionError, formString } from "./actions";
import { recordAudit } from "./audit";
import { type OrgContext, requireOrgMember } from "./session";

/** What marketing actions and pages work on: one environment of the organization. */
export type MarketingTarget = {
  context: OrgContext;
  env: ContactEnvironment;
  projectId: string;
};

/**
 * The environment addressed by the form's slugs, inside the already-authorized organization
 * (actions take only slugs and ids; the organization comes from `requireOrgPermission`).
 */
export async function marketingTargetFromForm(
  context: OrgContext,
  formData: FormData,
): Promise<MarketingTarget> {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return {
    context,
    env: { organizationId: context.organization.id, environmentId: found.environment.id },
    projectId: found.project.id,
  };
}

/** Records a marketing change of the target's environment in the organization's audit log. */
export async function auditMarketing(
  target: MarketingTarget,
  input: {
    action: string;
    target?: { type: string; id: string | null; label?: string | null };
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await recordAudit(target.context.session, {
    ...input,
    organizationId: target.env.organizationId,
    projectId: target.projectId,
    environmentId: target.env.environmentId,
  });
}

/** A marketing page's environment, for members allowed to read contacts (404 otherwise). */
export async function marketingPage(
  params: {
    orgSlug: string;
    projectSlug: string;
    envSlug: string;
  },
  /** Broadcast pages need `broadcast:read` instead. */
  resource: "contact" | "broadcast" = "contact",
) {
  const context = await requireOrgMember(params.orgSlug);
  if (!context.can(resource === "broadcast" ? { broadcast: ["read"] } : { contact: ["read"] })) {
    notFound();
  }
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: params.projectSlug,
    envSlug: params.envSlug,
  });
  if (!found) notFound();
  const { organization } = context;
  const { project, environment } = found;
  return {
    context,
    organization,
    project,
    environment,
    env: { organizationId: organization.id, environmentId: environment.id },
    base: `/${organization.slug}/${project.slug}/${environment.slug}`,
    target: { orgSlug: organization.slug, projectSlug: project.slug, envSlug: environment.slug },
  };
}

/**
 * Every audience of the environment, following the cursors (the dashboard's pickers offer them
 * all), in `listAudiences`' shape.
 */
export async function listAllAudiences(env: ContactEnvironment) {
  const first = await listAudiences(env, { limit: 100 });
  const data = [...first.data];
  let more = first.has_more;
  while (more) {
    const next = await listAudiences(env, { limit: 100, after: data.at(-1)?.id });
    data.push(...next.data);
    more = next.has_more;
  }
  return { object: "list" as const, data, has_more: false };
}
