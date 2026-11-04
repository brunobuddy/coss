import { cn } from "@coss/ui/lib/utils";
import type * as PageTree from "fumadocs-core/page-tree";
import type { CSSProperties, ReactNode } from "react";
import { DOCS_SIDEBAR_WIDTH, SITE_SHELL_ID } from "@/lib/nav";
import type { NavItem } from "@/lib/site";
import { SiteHeader } from "./site-header";

/**
 * The page frame of coss.com/ui: the vertical rails with their corner marks under the header, the
 * sticky header, then the page. Each route group renders it so a landing page can pass its own
 * header links and docs.
 */
export function SiteShell({
  items,
  tree,
  searchApi,
  docsSidebar = false,
  rails = true,
  className,
  children,
}: {
  items?: readonly NavItem[];
  /** The docs the menus list and the ⌘K menu searches (coss's docs unless given). */
  tree?: PageTree.Root;
  searchApi?: string;
  /** The page has the docs sidebar: the header's wordmark cell lines up with it. */
  docsSidebar?: boolean;
  /** The docs' page rails and ruled header cells; the marketing pages go without. */
  rails?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={SITE_SHELL_ID}
      className={cn(
        "relative isolate flex min-h-svh flex-col overflow-clip [--header-height:4rem]",
        className,
      )}
      style={docsSidebar ? ({ "--sidebar-width": DOCS_SIDEBAR_WIDTH } as CSSProperties) : undefined}
    >
      {rails ? (
        <>
          <div
            aria-hidden="true"
            className="container pointer-events-none absolute inset-0 z-45 before:absolute before:inset-y-0 before:-left-3 before:w-px before:bg-border/64 after:absolute after:inset-y-0 after:-right-3 after:w-px after:bg-border/64"
          />
          <div
            aria-hidden="true"
            className="container pointer-events-none fixed inset-x-0 top-0 z-45 h-(--header-height) before:absolute before:top-[calc(var(--header-height)-4.5px)] before:-left-[11.5px] before:z-1 before:-ml-1 before:size-2 before:rounded-[2px] before:border before:border-border before:bg-popover before:bg-clip-padding before:shadow-xs/5 after:absolute after:top-[calc(var(--header-height)-4.5px)] after:-right-[11.5px] after:z-1 after:-mr-1 after:size-2 after:rounded-[2px] after:border after:border-border after:bg-background after:bg-clip-padding after:shadow-xs/5 dark:after:bg-clip-border dark:before:bg-clip-border"
          />
        </>
      ) : null}
      <SiteHeader
        docsSidebar={docsSidebar}
        items={items}
        ruled={rails}
        searchApi={searchApi}
        tree={tree}
      />
      {children}
    </div>
  );
}
