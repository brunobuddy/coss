import { environmentHref, parseOrgLink, settingsHref } from "@coss/dashboard-routes";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listProjectsWithDefaultEnvironment, toShellProjects } from "@/lib/projects";
import { environmentCookieName, rememberedEnvironment } from "@/lib/remembered-environment";
import { requireOrgMember } from "@/lib/session";

/**
 * An organization opens in the environment last used in it. `?to=/email/domains` opens that page
 * there: links made without an environment (emails, notifications) use it.
 */
export default async function OrganizationPage({ params, searchParams }: PageProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const { to } = await searchParams;
  const { organization, can } = await requireOrgMember(orgSlug);
  const projects = toShellProjects(await listProjectsWithDefaultEnvironment(organization.id));
  const cookie = (await cookies()).get(environmentCookieName(organization.slug))?.value;
  const current = rememberedEnvironment(projects, cookie);
  if (!current) {
    const create = can({ project: ["create"] }) ? "?new=1" : "";
    redirect(settingsHref(organization.slug, `/projects${create}`));
  }
  const base = environmentHref({
    organization: organization.slug,
    project: current.project.slug,
    environment: current.environment.slug,
  });
  redirect(base + (parseOrgLink(typeof to === "string" ? to : undefined) ?? ""));
}
