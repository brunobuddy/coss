import "server-only";
import { environmentsWithSentEmail } from "@coss/email";
import { type Environment, listProjectsWithEnvironments, type Project } from "@coss/tenancy";
import { cache } from "react";
import type { ShellProject } from "@/components/shell/types";
import { defaultEnvironment, liveEnvironmentIds } from "./default-environment";

type ProjectWithDefaultEnvironment = {
  project: Project;
  environments: Environment[];
  defaultEnvironment: Environment | undefined;
};

/** The organization's projects, their environments and the one each opens on (once per request). */
export const listProjectsWithDefaultEnvironment = cache(async function list(
  organizationId: string,
): Promise<ProjectWithDefaultEnvironment[]> {
  const rows = await listProjectsWithEnvironments({ organizationId });
  const sent = await environmentsWithSentEmail({
    organizationId,
    environmentIds: liveEnvironmentIds(rows),
  });
  return rows.map((row) => ({
    ...row,
    defaultEnvironment: defaultEnvironment(row.environments, sent),
  }));
});

/** The projects as the shell's client components get them (names and slugs only). */
export function toShellProjects(rows: ProjectWithDefaultEnvironment[]): ShellProject[] {
  return rows.map(({ project, environments, defaultEnvironment }) => ({
    name: project.name,
    slug: project.slug,
    environments: environments.map((env) => ({ name: env.name, slug: env.slug, mode: env.mode })),
    defaultEnvironment: defaultEnvironment?.slug,
  }));
}
