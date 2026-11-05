import type { ShellEnvironment, ShellProject } from "@/components/shell/types";

/** The cookie holding `<project>/<environment>`, the last environment opened in an organization. */
export function environmentCookieName(orgSlug: string): string {
  return `coss_env.${orgSlug}`;
}

export type CurrentEnvironment = { project: ShellProject; environment: ShellEnvironment };

/** The environment named by the cookie when it still exists, else the first project's default one. */
export function rememberedEnvironment(
  projects: readonly ShellProject[],
  cookie: string | undefined,
): CurrentEnvironment | undefined {
  const [projectSlug, envSlug] = cookie?.split("/") ?? [];
  const remembered = projects.find((item) => item.slug === projectSlug);
  const environment = remembered?.environments.find((item) => item.slug === envSlug);
  if (remembered && environment) return { project: remembered, environment };
  for (const project of projects) {
    const fallback = project.environments.find((item) => item.slug === project.defaultEnvironment);
    if (fallback) return { project, environment: fallback };
  }
  return undefined;
}

/** Remembers the environment for a year (client side, after it was opened). */
export function rememberEnvironment(orgSlug: string, projectSlug: string, envSlug: string): void {
  const value = `${projectSlug}/${envSlug}`;
  // biome-ignore lint/suspicious/noDocumentCookie: one plain preference, read by the server.
  document.cookie = `${environmentCookieName(orgSlug)}=${value}; path=/; max-age=31536000; samesite=lax`;
}
