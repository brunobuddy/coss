"use client";
import { Button } from "@coss/ui/components/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@coss/ui/components/collapsible";
import { Drawer, DrawerPanel, DrawerPopup, DrawerTrigger } from "@coss/ui/components/drawer";
import { cn } from "@coss/ui/lib/utils";
import { ArrowRight01Icon, Menu09Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as PageTree from "fumadocs-core/page-tree";
import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentProps, Fragment, type ReactNode, useState } from "react";
import { ProductTile } from "@/components/marketing/product-tile";
import {
  activeSection,
  type DocsSection,
  type NavFolder,
  pagesOf,
  rootFolders,
  sectionsOf,
} from "@/lib/docs-tree";
import { PLATFORM_LINKS, PRODUCT_LINKS } from "@/lib/nav";
import type { NavItem } from "@/lib/site";
import { SectionIcon } from "./section-icon";

/**
 * The site's links, every product and the docs' sections in a drawer (below `lg`, where the header's
 * menus and the docs sidebar are hidden). On a docs page the docs come first, with the current
 * section's pages.
 */
export function MobileNav({
  tree,
  items,
  className,
}: {
  tree: PageTree.Root;
  items: readonly NavItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const sections = sectionsOf(tree);
  const onDocsPage = rootFolders(tree).some((root) =>
    pagesOf(root).some((page) => page.url === pathname),
  );
  const docs = (
    <DocsNav
      current={onDocsPage ? activeSection(tree, pathname) : undefined}
      onOpenChange={setOpen}
      pathname={pathname}
      sections={sections}
    />
  );

  return (
    <Drawer onOpenChange={setOpen} open={open} position="left">
      <DrawerTrigger
        render={
          <Button className={cn("relative -ms-1.5 size-8", className)} size="icon" variant="ghost">
            <HugeiconsIcon className="size-5" icon={Menu09Icon} strokeWidth={2} />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        }
      />
      <DrawerPopup showCloseButton variant="straight">
        <DrawerPanel className="flex flex-col gap-12 p-6 pt-8" scrollFade={false}>
          {onDocsPage && docs}
          <div className="flex flex-col gap-3">
            <div className="font-medium text-sm">Menu</div>
            <div className="flex flex-col gap-1">
              <MobileLink href="/" onOpenChange={setOpen}>
                Home
              </MobileLink>
              {items.map((item) =>
                item.external ? (
                  <a
                    className="flex items-center gap-2 py-1.5 text-muted-foreground"
                    href={item.href}
                    key={item.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {item.label}
                  </a>
                ) : (
                  <MobileLink href={item.href} key={item.href} onOpenChange={setOpen}>
                    {item.label}
                  </MobileLink>
                ),
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="font-medium text-sm">Products</div>
            <div className="flex flex-col gap-0.5">
              {PRODUCT_LINKS.map((product) => (
                <Fragment key={product.slug}>
                  <MobileLink className="gap-3" href={product.href} onOpenChange={setOpen}>
                    <ProductTile size="sm" slug={product.slug} />
                    {product.label}
                  </MobileLink>
                  {product.items ? (
                    <div className="ms-3.5 flex flex-col gap-0.5 border-border/64 border-s ps-[1.3125rem]">
                      {product.items.map((item) => (
                        <MobileLink href={item.href} key={item.slug} onOpenChange={setOpen}>
                          {item.label}
                        </MobileLink>
                      ))}
                    </div>
                  ) : null}
                </Fragment>
              ))}
              <MobileLink href="/products" onOpenChange={setOpen}>
                All products
              </MobileLink>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="font-medium text-sm">Platform</div>
            <div className="flex flex-col gap-0.5">
              {PLATFORM_LINKS.map((link) => (
                <MobileLink href={link.href} key={link.href} onOpenChange={setOpen}>
                  {link.label}
                </MobileLink>
              ))}
            </div>
          </div>
          {!onDocsPage && docs}
        </DrawerPanel>
      </DrawerPopup>
    </Drawer>
  );
}

function MobileLink({
  href,
  onOpenChange,
  className,
  children,
  ...props
}: LinkProps &
  Pick<ComponentProps<"a">, "aria-current"> & {
    onOpenChange?: (open: boolean) => void;
    children: ReactNode;
    className?: string;
  }) {
  return (
    <Link
      className={cn("flex items-center gap-2 py-1.5 text-muted-foreground", className)}
      href={href}
      onClick={() => onOpenChange?.(false)}
      {...props}
    >
      {children}
    </Link>
  );
}

/** The docs' sections and, on a docs page, the current section's pages (API resources fold). */
function DocsNav({
  sections,
  current,
  pathname,
  onOpenChange,
}: {
  sections: DocsSection[];
  current?: DocsSection;
  pathname: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      {sections.length > 1 && (
        <div className="flex flex-col gap-3">
          <div className="font-medium text-sm">Docs</div>
          <div className="flex flex-col gap-0.5">
            {sections.map((section) => (
              <MobileLink
                aria-current={section.key === current?.key ? "true" : undefined}
                className="aria-[current]:text-foreground"
                href={section.url}
                key={section.key}
                onOpenChange={onOpenChange}
              >
                <SectionIcon className="size-4 shrink-0" name={section.icon} />
                {section.name}
              </MobileLink>
            ))}
          </div>
        </div>
      )}
      {current?.groups.map((group) => (
        <div className="flex flex-col gap-3" key={group.key}>
          <div className="font-medium text-sm">{group.label || current.name}</div>
          <div className="flex flex-col gap-0.5">
            {group.entries.map((entry) =>
              entry.type === "folder" ? (
                <MobileFolder
                  folder={entry}
                  key={entry.key}
                  onOpenChange={onOpenChange}
                  pathname={pathname}
                />
              ) : (
                <MobileLink
                  aria-current={entry.url === pathname ? "page" : undefined}
                  className="aria-[current]:text-foreground"
                  href={entry.url}
                  key={entry.url}
                  onOpenChange={onOpenChange}
                >
                  {entry.name}
                </MobileLink>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function MobileFolder({
  folder,
  pathname,
  onOpenChange,
}: {
  folder: NavFolder;
  pathname: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Collapsible defaultOpen={folder.pages.some((page) => page.url === pathname)}>
      <CollapsibleTrigger className="group/folder flex w-full items-center gap-2 py-1.5 text-muted-foreground">
        <span className="flex-1 text-start">{folder.name}</span>
        <span className="text-muted-foreground/72 text-xs tabular-nums">{folder.pages.length}</span>
        <HugeiconsIcon
          aria-hidden
          className="size-3.5 transition-transform duration-200 group-data-panel-open/folder:rotate-90 motion-reduce:transition-none"
          icon={ArrowRight01Icon}
          strokeWidth={2}
        />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="ms-1 flex flex-col gap-0.5 border-border/64 border-s ps-3">
          {folder.pages.map((page) => (
            <MobileLink
              aria-current={page.url === pathname ? "page" : undefined}
              className="aria-[current]:text-foreground [&_.ms-auto]:ms-auto"
              href={page.url}
              key={page.url}
              onOpenChange={onOpenChange}
            >
              <span className="flex flex-1 items-start justify-between gap-2">{page.name}</span>
            </MobileLink>
          ))}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
