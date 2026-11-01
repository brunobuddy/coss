import type { EnvironmentMode } from "@coss/tenancy";

/** Plain data the shell's client components get from the layouts. */
export type ShellOrganization = {
  name: string;
  slug: string;
  /** Its logo's URL (versioned), when one was found. */
  logo?: string | null;
};

export type ShellEnvironment = { name: string; slug: string; mode: EnvironmentMode };

export type ShellProject = {
  name: string;
  slug: string;
  environments: ShellEnvironment[];
  /** The slug of the environment the project opens on (`defaultEnvironment`). */
  defaultEnvironment: string | undefined;
};
