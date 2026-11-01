import "server-only";
import { environmentsWithSentEmail } from "@coss/email";
import { type Environment, listProjectsWithEnvironments, type Project } from "@coss/tenancy";
import type { ShellProject } from "@/components/shell/types";
import { defaultEnvironment, liveEnvironmentIds } from "./default-environment";

/** The organization's projects with their environments and the one each opens on. */
export async function listProjectsWithDefaultEnvironment(organizationId: string): Promise<
  {
    project: Project;
    environments: Environment[];
    defaultEnvironment: Environment | undefined;
  }[]
> {
  const rows = await listProjectsWithEnvironments({ organizationId });
  const sent = await environmentsWithSentEmail({
    organizationId,
    environmentIds: liveEnvironmentIds(rows),
  });
  return rows.map((row) => ({
    ...row,
    defaultEnvironment: defaultEnvironment(row.environments, sent),
  }));
}

/** The projects as the shell's client components get them (names and slugs only). */
export function toShellProjects(
  rows: Awaited<ReturnType<typeof listProjectsWithDefaultEnvironment>>,
): ShellProject[] {
  return rows.map(({ project, environments, defaultEnvironment }) => ({
    name: project.name,
    slug: project.slug,
    environments: environments.map((env) => ({ name: env.name, slug: env.slug, mode: env.mode })),
    defaultEnvironment: defaultEnvironment?.slug,
  }));
}
