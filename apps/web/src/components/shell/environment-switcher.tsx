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
import { cn } from "@coss/ui/lib/utils";
import { CheckIcon, ChevronsUpDownIcon, FolderIcon, PlusIcon, Settings2Icon } from "lucide-react";
import Link from "next/link";
import { activeNavItem, environmentPath } from "@/lib/navigation";
import { ProductGlyph } from "../product-glyph";
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
  // Other projects open in the environment of the same name when they have one.
  const others = props.projects
    .filter((project) => project.slug !== props.project.slug)
    .flatMap((project) => {
      const envSlug = project.environments.some((env) => env.slug === props.environment.slug)
        ? props.environment.slug
        : project.defaultEnvironment;
      return envSlug ? [{ project, envSlug }] : [];
    });

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
      <MenuPopup align="start" className="max-h-[min(32rem,var(--available-height))] w-72">
        <div className="flex items-center gap-3 px-2 pt-1.5 pb-2.5">
          <ProductGlyph className="size-10 rounded-xl" icon={FolderIcon} tone="neutral" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-heading font-semibold text-base text-foreground">
              {props.project.name}
            </span>
            <span className="truncate text-muted-foreground text-xs">
              {plural(props.project.environments.length, "environment")}
            </span>
          </div>
        </div>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel className="label-caps">Environment</MenuGroupLabel>
          {props.project.environments.map((env) => {
            const current = env.slug === props.environment.slug;
            return (
              <MenuLinkItem
                key={env.slug}
                render={<Link href={hrefIn(props.project.slug, env.slug)} />}
              >
                <StatusDot
                  className={cn("min-w-0 flex-1", current && "font-medium")}
                  tone={env.mode === "live" ? "success" : "info"}
                >
                  <span className="truncate">{env.name}</span>
                </StatusDot>
                <span className="rounded-full border px-1.5 text-[0.6875rem] text-muted-foreground leading-4">
                  {env.mode === "live" ? "Live" : "Sandbox"}
                </span>
                <CheckIcon className={cn("ms-1", current ? "" : "invisible")} />
              </MenuLinkItem>
            );
          })}
        </MenuGroup>
        {others.length > 0 ? (
          <>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel className="label-caps">Switch project</MenuGroupLabel>
              {others.map(({ project, envSlug }) => (
                <MenuLinkItem
                  key={project.slug}
                  render={<Link href={hrefIn(project.slug, envSlug)} />}
                >
                  <ProductGlyph className="size-6 rounded-md" icon={FolderIcon} tone="neutral" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                </MenuLinkItem>
              ))}
            </MenuGroup>
          </>
        ) : null}
        <MenuSeparator />
        <MenuLinkItem
          className="text-muted-foreground"
          render={<Link href={settingsHref(props.orgSlug, "/projects")} />}
        >
          <Settings2Icon />
          Manage projects
        </MenuLinkItem>
        <MenuLinkItem
          className="text-muted-foreground"
          render={<Link href={settingsHref(props.orgSlug, "/projects?new=1")} />}
        >
          <PlusIcon />
          New project
        </MenuLinkItem>
      </MenuPopup>
    </Menu>
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
