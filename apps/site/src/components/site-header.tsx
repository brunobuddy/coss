import { cn } from "@coss/ui/lib/utils";
import type * as PageTree from "fumadocs-core/page-tree";
import Link from "next/link";
import { withoutNestedFolders } from "@/lib/docs-tree";
import { HEADER_BAR_ID } from "@/lib/nav";
import { NAV_ITEMS, type NavItem, SEARCH_API } from "@/lib/site";
import { source } from "@/lib/source";
import { AccountLinks } from "./account-links";
import { CommandMenu } from "./command-menu";
import { MegaMenu } from "./mega-menu";
import { MobileNav } from "./mobile-nav";
import { SectionLabel } from "./section-label";

/** A header cell: full height, set off from the previous one by a hairline, like the page's ruling. */
const CELL = "flex h-full items-center border-border/64 border-s";

/**
 * The header of coss.com/ui (the coss ui docs), adapted: the wordmark names the section instead
 * of a product and the mega menu follows it on the left; on the right, search and the account
 * links sit in ruled cells.
 */
export function SiteHeader({
  items = NAV_ITEMS,
  tree = withoutNestedFolders(source.getPageTree()),
  searchApi = SEARCH_API,
  docsSidebar = false,
}: {
  items?: readonly NavItem[];
  tree?: PageTree.Root;
  searchApi?: string;
  /** Size the wordmark's cell to the docs sidebar (`--sidebar-width`, set by `SiteShell`). */
  docsSidebar?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 w-full bg-sidebar/80 backdrop-blur-sm before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border/64">
      {/* The mega menu's anchor: the page's sheet between the shell's rails (`container` + 12px a side). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-[1440px] -translate-x-1/2"
        id={HEADER_BAR_ID}
      />
      <div className="container relative flex h-(--header-height) w-full items-center gap-2 px-4 sm:px-6">
        <MobileNav className="flex lg:hidden" items={items} tree={tree} />
        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 pe-4 font-bold font-heading text-[1.375em] [font-variation-settings:'GEOM'_50,'opsz'_32] sm:text-2xl lg:pe-5",
            // The sidebar starts at the container's edge; the wordmark after the header's padding
            // (6), and the next cell's rule after the row's gap (2).
            docsSidebar && "lg:w-[calc(var(--sidebar-width)-(--spacing(8)))]",
          )}
        >
          <Link aria-label="Home" href="/">
            coss.com
          </Link>
          <SectionLabel />
        </div>
        <div className={`${CELL} ps-3 max-lg:hidden`}>
          {/* The main site's own menus, or a section's links (Shipyard, kloq) after "Products". */}
          <MegaMenu links={items === NAV_ITEMS ? undefined : items} />
        </div>
        <div className="ms-auto flex h-full items-center">
          <div className={`${CELL} px-3 max-md:hidden`}>
            <CommandMenu navItems={items} searchApi={searchApi} tree={tree} />
          </div>
          {/* No hairline on the right: the cell ends at the page rail (24px of padding, plus 12px once
              the rails are on screen), so its left padding matches that to centre the links. */}
          <div className={`${CELL} ps-3 max-md:border-s-0 md:ps-6 min-[90rem]:ps-9`}>
            <AccountLinks />
          </div>
        </div>
      </div>
    </header>
  );
}
