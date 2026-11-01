"use client";

import { DEVELOPERS, PRODUCTS, settingsHref } from "@coss/dashboard-routes";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@coss/ui/components/menu";
import { CheckIcon, ChevronsUpDownIcon, FolderIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { activeNavItem, environmentPath } from "@/lib/navigation";
import { StatusDot } from "../status-dot";
import type { ShellEnvironment, ShellProject } from "./types";

const SWITCHABLE_PAGES = [
  { path: "/products" },
  ...[...PRODUCTS, DEVELOPERS].flatMap((section) => section.pages),
];

/**
 * The current project and environment, first in the header. Switching keeps the page's section
 * (`…/email/templates` in another environment) but not its ids, which belong to this one.
 */
export function EnvironmentSwitcher(props: {
  orgSlug: string;
  projects: ShellProject[];
  project: ShellProject;
  environment: ShellEnvironment;
  pathname: string;
}) {
  const base = environmentPath(props.orgSlug, props.project.slug, props.environment.slug);
  const page = props.pathname.startsWith(base)
    ? activeNavItem(props.pathname, base, SWITCHABLE_PAGES)
    : undefined;
  const hrefIn = (projectSlug: string, envSlug: string) =>
    environmentPath(props.orgSlug, projectSlug, envSlug) + (page?.path ?? "");
  const live = props.environment.mode === "live";

  return (
    <Menu>
      <MenuTrigger className="flex h-8 min-w-0 items-center gap-2 rounded-lg border border-input border-b-foreground/16 bg-background bg-linear-to-b from-40% from-transparent to-foreground/4 px-2.5 text-sm shadow-xs/5 outline-none transition-[background-color,transform] hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px data-popup-open:bg-accent/50 motion-reduce:active:translate-y-0 dark:border-b-input dark:bg-input/32 dark:from-white/5 dark:to-transparent">
        <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="max-w-40 truncate font-medium text-foreground max-sm:hidden">
          {props.project.name}
        </span>
        <span aria-hidden className="text-muted-foreground/48 max-sm:hidden">
          /
        </span>
        <StatusDot className="min-w-0 text-foreground" tone={live ? "success" : "info"}>
          <span className="max-w-32 truncate">{props.environment.name}</span>
        </StatusDot>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup align="start" className="max-h-[min(32rem,var(--available-height))] min-w-64">
        {props.projects.map((project) => (
          <MenuGroup key={project.slug}>
            <MenuGroupLabel>{project.name}</MenuGroupLabel>
            {project.environments.map((env) => {
              const current =
                project.slug === props.project.slug && env.slug === props.environment.slug;
              return (
                <MenuLinkItem
                  key={env.slug}
                  render={<Link href={hrefIn(project.slug, env.slug)} />}
                >
                  <CheckIcon className={current ? "" : "invisible"} />
                  <StatusDot tone={env.mode === "live" ? "success" : "info"}>{env.name}</StatusDot>
                  <span className="ms-auto ps-3 text-muted-foreground text-xs">
                    {env.mode === "live" ? "Live" : "Sandbox"}
                  </span>
                </MenuLinkItem>
              );
            })}
          </MenuGroup>
        ))}
        <MenuSeparator />
        <MenuLinkItem render={<Link href={settingsHref(props.orgSlug, "/projects")} />}>
          <FolderIcon />
          Manage projects
        </MenuLinkItem>
        <MenuLinkItem render={<Link href={settingsHref(props.orgSlug, "/projects?new=1")} />}>
          <PlusIcon />
          New project
        </MenuLinkItem>
      </MenuPopup>
    </Menu>
  );
}
