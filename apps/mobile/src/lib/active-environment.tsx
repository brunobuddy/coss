import type { MobileProject, OrganizationResponse } from "@coss/companion";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type EnvironmentChoice,
  lastEnvironment,
  rememberEnvironment,
  rememberOrganization,
} from "./last-org";
import { useOrganization } from "./queries";
import type { EnvironmentParams } from "./web";

type ActiveEnvironment = {
  /** Native tabs don't pass `[org]` to tab roots: they read it here. */
  org: string;
  /** `null` until the organization has loaded, or when it has no environment. */
  params: EnvironmentParams | null;
  project: MobileProject | null;
  organization: OrganizationResponse | undefined;
  isPending: boolean;
  select: (choice: EnvironmentChoice) => void;
};

const Context = createContext<ActiveEnvironment | null>(null);

function preferred(projects: MobileProject[]): EnvironmentChoice | null {
  for (const project of projects) {
    const environment =
      project.environments.find((env) => env.mode === "live") ?? project.environments[0];
    if (environment) return { project: project.slug, env: environment.slug };
  }
  return null;
}

/** The dashboard's `/<org>`: the environment used last in this organization, kept per device. */
export function ActiveEnvironmentProvider(props: { org: string; children: ReactNode }) {
  const { org } = props;
  const organization = useOrganization(org);
  const [stored, setStored] = useState<EnvironmentChoice | null | undefined>();

  useEffect(() => {
    setStored(undefined);
    let current = true;
    void lastEnvironment(org).then((choice) => {
      if (current) setStored(choice);
    });
    return () => {
      current = false;
    };
  }, [org]);

  const slug = organization.data?.organization.slug;
  useEffect(() => {
    if (slug) rememberOrganization(slug);
  }, [slug]);

  const select = useCallback(
    (choice: EnvironmentChoice) => {
      setStored(choice);
      void rememberEnvironment(org, choice);
    },
    [org],
  );

  const value = useMemo<ActiveEnvironment>(() => {
    const projects = organization.data?.projects ?? [];
    const valid = projects
      .find((project) => project.slug === stored?.project)
      ?.environments.some((env) => env.slug === stored?.env)
      ? stored
      : null;
    const chosen = stored === undefined ? null : (valid ?? preferred(projects));
    return {
      org,
      params: chosen ? { org, project: chosen.project, env: chosen.env } : null,
      project: projects.find((project) => project.slug === chosen?.project) ?? null,
      organization: organization.data,
      isPending: organization.isPending || stored === undefined,
      select,
    };
  }, [org, organization.data, organization.isPending, stored, select]);

  return <Context value={value}>{props.children}</Context>;
}

export function useActiveEnvironment(): ActiveEnvironment {
  const value = use(Context);
  if (!value) throw new Error("useActiveEnvironment must be used inside its provider");
  return value;
}
