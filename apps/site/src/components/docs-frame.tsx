import { Card, CardFrame, CardPanel } from "@coss/ui/components/card";
import { ScrollArea } from "@coss/ui/components/scroll-area";
import { SidebarProvider } from "@coss/ui/components/sidebar";
import { cn } from "@coss/ui/lib/utils";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as PageTree from "fumadocs-core/page-tree";
import type { TOCItemType } from "fumadocs-core/toc";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { NavPage } from "@/lib/docs-tree";
import { DOCS_SIDEBAR_WIDTH } from "@/lib/nav";
import { DocsCopyPage } from "./docs-copy-page";
import { DocsSidebar } from "./docs-sidebar";
import { DocsTableOfContents } from "./docs-toc";
import { DocsFooter } from "./site-footer";

/**
 * The docs layout of coss.com/ui, shared by coss's docs and Shipyard's: the sidebar (the current
 * root folder's groups) beside the page.
 */
export function DocsLayoutFrame({ tree, children }: { tree: PageTree.Root; children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col">
      <SidebarProvider
        className="container min-h-min flex-1 items-start px-0 [--top-spacing:0] lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] lg:[--top-spacing:calc(var(--spacing)*4)]"
        style={{ "--sidebar-width": DOCS_SIDEBAR_WIDTH } as CSSProperties}
      >
        <DocsSidebar tree={tree} />
        {/* min-w-0: a flex item, or code blocks would widen it to their longest line. */}
        <div className="h-full w-full min-w-0">{children}</div>
      </SidebarProvider>
    </main>
  );
}

/**
 * The docs page of coss.com/ui: the card-framed page with its title, description and
 * "Copy Markdown", the links to the pages before and after it in its section, the footer in the
 * frame, and the "On This Page" table of contents beside it.
 */
export function DocsPageFrame({
  title,
  description,
  lastUpdated,
  markdown,
  toc,
  neighbours,
  related,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** YYYY-MM-DD, when known. */
  lastUpdated?: string;
  /** The page as Markdown, for "Copy Markdown". */
  markdown: string;
  toc: TOCItemType[];
  /** The pages before and after this one in its section. */
  neighbours?: { previous?: NavPage; next?: NavPage };
  /** Where to read about the page's product: its page, pricing, comparisons. */
  related?: readonly { title: string; url: string }[];
  children: ReactNode;
}) {
  return (
    <div className="flex items-stretch xl:w-full" data-slot="docs">
      <div className="relative flex w-full min-w-0 flex-1 flex-col lg:mt-8 lg:mr-4 lg:mb-8">
        <CardFrame className="border-sidebar-border shadow-lg/5 max-lg:border-none dark:bg-background">
          <Card className="max-lg:rounded-none! dark:bg-background max-lg:[clip-path:none]!">
            <CardPanel className="px-4 py-6 sm:px-6 lg:p-8">
              <div className="mx-auto w-full max-w-3xl">
                <div className="flex min-w-0 flex-col gap-8">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-2">
                      <h1 className="scroll-m-20 font-bold font-heading text-3xl xl:text-4xl">
                        {title}
                      </h1>
                      {description && (
                        <p className="text-muted-foreground sm:text-lg">{description}</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 pt-4">
                      <DocsCopyPage page={markdown} />
                    </div>
                  </div>
                  <div className="w-full flex-1 *:data-[slot=alert]:first:mt-0">{children}</div>
                  {lastUpdated && (
                    <p className="text-muted-foreground text-sm">
                      Last updated{" "}
                      <time dateTime={lastUpdated}>
                        {new Date(`${lastUpdated}T00:00:00Z`).toLocaleDateString("en-US", {
                          dateStyle: "long",
                          timeZone: "UTC",
                        })}
                      </time>
                    </p>
                  )}
                  {related && related.length > 0 && (
                    <nav aria-label="Related" className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                      {related.map((link) => (
                        <Link
                          className="text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                          href={link.url}
                          key={link.url}
                        >
                          {link.title}
                        </Link>
                      ))}
                    </nav>
                  )}
                  {(neighbours?.previous || neighbours?.next) && <PageNeighbours {...neighbours} />}
                </div>
              </div>
            </CardPanel>
          </Card>
          <div className="px-4 py-6 lg:rounded-b-2xl lg:px-8">
            <DocsFooter />
          </div>
        </CardFrame>
      </div>
      <div className="sticky top-(--header-height) z-30 ms-auto hidden h-[calc(100svh-var(--header-height))] w-72 flex-col overflow-hidden overscroll-none xl:flex">
        <ScrollArea
          className="**:data-[slot=scroll-area-scrollbar]:hidden"
          overscrollContain
          scrollFade
        >
          <div className="flex min-h-0 flex-col gap-2 py-2">
            <div className="h-(--top-spacing) shrink-0" />
            {toc.length > 0 && <DocsTableOfContents toc={toc} />}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

/** "Previous" and "Next" under a page: one ruled row, the next page on the right. */
function PageNeighbours({ previous, next }: { previous?: NavPage; next?: NavPage }) {
  return (
    <nav
      aria-label="More in this section"
      className="mt-4 grid overflow-hidden rounded-xl border border-border/64 sm:grid-cols-2"
    >
      {previous ? <NeighbourLink direction="previous" page={previous} /> : <span aria-hidden />}
      {next && <NeighbourLink afterPrevious={!!previous} direction="next" page={next} />}
    </nav>
  );
}

function NeighbourLink({
  page,
  direction,
  afterPrevious = false,
}: {
  page: NavPage;
  direction: "previous" | "next";
  /** Ruled off from the previous page's link (beside it, or above it on phones). */
  afterPrevious?: boolean;
}) {
  const isNext = direction === "next";
  return (
    <Link
      className={cn(
        "group flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-accent/50",
        isNext && "items-end text-end sm:col-start-2",
        afterPrevious && "border-border/64 max-sm:border-t sm:border-s",
      )}
      href={page.url}
      rel={isNext ? "next" : "prev"}
    >
      <span className="flex items-center gap-1 text-muted-foreground text-sm">
        {!isNext && (
          <HugeiconsIcon aria-hidden className="size-3.5" icon={ArrowLeft01Icon} strokeWidth={2} />
        )}
        {isNext ? "Next" : "Previous"}
        {isNext && (
          <HugeiconsIcon aria-hidden className="size-3.5" icon={ArrowRight01Icon} strokeWidth={2} />
        )}
      </span>
      <span className="font-medium text-foreground [&_.ms-auto]:ms-2">{page.name}</span>
    </Link>
  );
}
