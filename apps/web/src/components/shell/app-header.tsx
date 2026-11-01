"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@coss/ui/components/breadcrumb";
import { SidebarTrigger } from "@coss/ui/components/sidebar";
import { cn } from "@coss/ui/lib/utils";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Fragment } from "react";
import { environmentPath, segmentLabel } from "@/lib/navigation";
import { CommandMenu, type CommandMenuData } from "./command-menu";
import { EnvironmentSwitcher } from "./environment-switcher";
import type { ShellProject } from "./types";

type Crumb = { label: string; href: string; mono: boolean };

/** An organization's pages start with its project and environment instead of their segments. */
export type HeaderContext = {
  orgSlug: string;
  projects: ShellProject[];
  fallback: { project: string; environment: string } | null;
};

/**
 * The trail to the current page from its path, below `root` (whose own crumb is `rootLabel`).
 * `names` labels dynamic segments by the path they end; unnamed ones (ids) show in mono.
 */
function crumbsFor(
  pathname: string,
  names: Record<string, string>,
  root = "",
  rootLabel?: string,
): Crumb[] {
  const segments = pathname.slice(root.length).split("/").filter(Boolean);
  const crumbs: Crumb[] = rootLabel ? [{ label: rootLabel, href: root, mono: false }] : [];
  segments.forEach((segment, index) => {
    const href = `${root}/${segments.slice(0, index + 1).join("/")}`;
    const named = names[href] ?? segmentLabel(segment);
    crumbs.push({ label: named ?? decodeURIComponent(segment), href, mono: !named });
  });
  return crumbs;
}

/** The bar at the top of the content frame: sidebar toggle, breadcrumbs and search. */
export function AppHeader(props: {
  names: Record<string, string>;
  command: CommandMenuData;
  context?: HeaderContext;
}) {
  const pathname = usePathname();
  const params = useParams<{ projectSlug?: string; envSlug?: string }>();
  const context = props.context;
  const projectSlug = params.projectSlug ?? context?.fallback?.project;
  const envSlug = params.projectSlug ? params.envSlug : context?.fallback?.environment;
  const project = context?.projects.find((item) => item.slug === projectSlug);
  const environment = project?.environments.find((item) => item.slug === envSlug);
  const envBase =
    context && project && environment
      ? environmentPath(context.orgSlug, project.slug, environment.slug)
      : null;
  const settings = context ? `/${context.orgSlug}/settings` : null;
  const crumbs =
    settings && pathname.startsWith(settings)
      ? crumbsFor(pathname, props.names, settings, "Organization")
      : envBase && pathname.startsWith(envBase)
        ? pathname === envBase
          ? [{ label: "Home", href: envBase, mono: false }]
          : crumbsFor(pathname, props.names, envBase)
        : crumbsFor(pathname, props.names);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 rounded-t-[inherit] border-b bg-background/88 px-3 backdrop-blur-sm sm:px-4">
      <SidebarTrigger className="-ms-1" />
      <div aria-hidden className="h-4 w-px bg-border" />
      {context && project && environment ? (
        <>
          <EnvironmentSwitcher
            environment={environment}
            orgSlug={context.orgSlug}
            pathname={pathname}
            project={project}
            projects={context.projects}
          />
          <div aria-hidden className="h-4 w-px bg-border max-sm:hidden" />
        </>
      ) : null}
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            // Small screens keep the last two crumbs.
            const hidden = index < crumbs.length - 2 ? "max-md:hidden" : undefined;
            const label = (
              <span
                className={cn(
                  "block truncate",
                  crumb.mono ? "max-w-40 font-mono text-xs" : "max-w-48",
                )}
              >
                {crumb.label}
              </span>
            );
            return (
              <Fragment key={crumb.href}>
                {index > 0 ? (
                  // The separator before the first visible crumb goes with the hidden ones.
                  <BreadcrumbSeparator
                    className={index <= crumbs.length - 2 ? "max-md:hidden" : undefined}
                  />
                ) : null}
                <BreadcrumbItem className={cn("min-w-0", hidden)}>
                  {last ? (
                    <BreadcrumbPage className="font-medium">{label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>{label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <CommandMenu data={props.command} />
    </header>
  );
}
