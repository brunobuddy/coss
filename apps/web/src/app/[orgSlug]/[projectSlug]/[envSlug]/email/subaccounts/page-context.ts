import "server-only";
import { getEnvironment } from "@coss/tenancy";
import { notFound } from "next/navigation";
import { requireOrgMember } from "@/lib/session";

/** Every sub-account page: a member who can read sub-accounts, in an environment of the organization. */
export async function subaccountPageContext(params: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
}) {
  const { organization, can } = await requireOrgMember(params.orgSlug);
  if (!can({ subaccount: ["read"] })) notFound();
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
    subaccountsPath: `${envPath}/email/subaccounts`,
    target: { orgSlug: organization.slug, projectSlug: project.slug, envSlug: environment.slug },
  };
}

export const REPUTATION_TONE = {
  good: ["success", "Good"],
  warning: ["warning", "Warning"],
  paused: ["error", "Paused"],
} as const;

export const STATUS_TONE = {
  active: ["success", "Active"],
  disabled: ["neutral", "Disabled"],
  deleting: ["warning", "Deleting"],
} as const;
