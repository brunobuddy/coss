"use client";
import { NavigationMenu } from "@base-ui/react/navigation-menu";
import { Badge } from "@coss/ui/components/badge";
import { buttonVariants } from "@coss/ui/components/button";
import { cn } from "@coss/ui/lib/utils";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRightIcon, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { ProductTile } from "@/components/marketing/product-tile";
import {
  DEVELOPER_COLUMNS,
  HEADER_BAR_ID,
  type MenuColumn,
  type MenuLink,
  PLATFORM_LINKS,
  PRODUCT_LINKS,
  type ProductLink,
  SITE_SHELL_ID,
} from "@/lib/nav";
import type { NavItem } from "@/lib/site";

const TRIGGER = cn(
  buttonVariants({ variant: "ghost" }),
  "data-popup-open:bg-accent [&_svg]:transition-transform data-popup-open:[&_svg]:rotate-180",
);

/**
 * The header's mega menu: "Products" (every product, from `PRODUCT_LINKS`) and, on
 * the main site, "Developers" and Pricing. A section with its own links (Shipyard, kloq) passes
 * them as `links` instead of the developer menu.
 */
export function MegaMenu({ links }: { links?: readonly NavItem[] }) {
  const pathname = usePathname();
  const [shell, setShell] = useState<HTMLElement | null>(null);
  useEffect(() => setShell(document.getElementById(SITE_SHELL_ID)), []);
  return (
    <NavigationMenu.Root className="h-full">
      <NavigationMenu.List className="flex h-full items-center gap-1">
        <NavigationMenu.Item value="products">
          <NavigationMenu.Trigger className={TRIGGER}>
            Products
            <ChevronDown />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className={CONTENT}>
            <ProductsPanel />
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        {links ? (
          links.map((item) => (
            <NavigationMenu.Item key={item.href}>
              <TopLink active={isActive(pathname, item.href)} item={item} />
            </NavigationMenu.Item>
          ))
        ) : (
          <>
            <NavigationMenu.Item value="developers">
              <NavigationMenu.Trigger className={TRIGGER}>
                Developers
                <ChevronDown />
              </NavigationMenu.Trigger>
              <NavigationMenu.Content className={CONTENT}>
                <Panel columns={DEVELOPER_COLUMNS} feature={<InstallFeature />} />
              </NavigationMenu.Content>
            </NavigationMenu.Item>
            <NavigationMenu.Item>
              <TopLink
                active={isActive(pathname, "/pricing")}
                item={{ label: "Pricing", href: "/pricing" }}
              />
            </NavigationMenu.Item>
          </>
        )}
      </NavigationMenu.List>

      <NavigationMenu.Portal container={shell}>
        <NavigationMenu.Positioner
          align="start"
          anchor={() => document.getElementById(HEADER_BAR_ID)}
          className="z-40 h-(--positioner-height) w-(--anchor-width) transition-[top,height] duration-(--duration) ease-(--easing) data-instant:transition-none"
          collisionAvoidance={{ side: "none", align: "none" }}
          sideOffset={0}
          style={{
            ["--duration" as string]: "0.3s",
            ["--easing" as string]: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <NavigationMenu.Popup className="relative h-(--popup-height) w-full origin-top overflow-hidden border-border/64 border-x border-b bg-popover shadow-[0_24px_48px_-24px_--theme(--color-black/16%)] outline-none transition-[opacity,height,translate] duration-(--duration) ease-(--easing) data-ending-style:-translate-y-1 data-starting-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:duration-150 dark:shadow-none">
            <NavigationMenu.Viewport className="relative h-full w-full" />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

const CONTENT =
  "w-(--anchor-width) transition-opacity duration-(--duration) ease-(--easing) data-ending-style:opacity-0 data-starting-style:opacity-0";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TopLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <NavigationMenu.Link
      active={active}
      className={cn(buttonVariants({ variant: "ghost" }), "data-active:text-foreground")}
      render={
        item.external ? (
          // biome-ignore lint/a11y/useAnchorContent: the link's label renders inside
          <a href={item.href} rel="noreferrer" target="_blank" />
        ) : (
          <Link href={item.href} />
        )
      }
    >
      {item.label}
    </NavigationMenu.Link>
  );
}

/**
 * The products panel: every product by name and tile, then the platform's links along the bottom.
 * Its edges line up with the header's wordmark and account links (24px, 36px once the rails show).
 */
function ProductsPanel() {
  return (
    <div className="flex flex-col">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_18rem] min-[90rem]:grid-cols-[minmax(0,1fr)_20rem]">
        <ul className="grid grid-flow-col grid-cols-3 grid-rows-5 content-start gap-x-2 gap-y-0.5 px-3.5 py-3 xl:pe-2 min-[90rem]:ps-6.5">
          {PRODUCT_LINKS.map((product) => (
            <li className={product.items ? "row-span-5" : undefined} key={product.slug}>
              <ProductEntry product={product} />
              {product.items ? (
                <ul className="ms-7 flex flex-col border-border/64 border-s ps-[1.1875rem]">
                  {product.items.map((item) => (
                    <li key={item.slug}>
                      <ProductEntry product={item} sub />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="flex p-3 max-xl:hidden min-[90rem]:pe-9">
          <AgentFeature />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-border/64 border-t px-6 py-3 text-sm min-[90rem]:px-9">
        {PLATFORM_LINKS.map((link) => (
          <NavigationMenu.Link
            className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:underline"
            closeOnClick
            key={link.href}
            render={<Link href={link.href} />}
          >
            {link.label}
          </NavigationMenu.Link>
        ))}
        <NavigationMenu.Link
          className="group ms-auto flex items-center gap-1 rounded-sm font-medium outline-none focus-visible:underline"
          closeOnClick
          render={<Link href="/products" />}
        >
          All products
          <ArrowRightIcon
            aria-hidden
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </NavigationMenu.Link>
      </div>
    </div>
  );
}

/** A product by tile and name. Under Email the rule stands in for the tile. */
function ProductEntry({ product, sub }: { product: ProductLink; sub?: boolean }) {
  return (
    <NavigationMenu.Link
      className={cn(
        "flex items-center gap-3 rounded-lg px-2.5 outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
        sub ? "py-1.5" : "py-2",
      )}
      closeOnClick
      render={<Link href={product.href} />}
    >
      {sub ? null : <ProductTile slug={product.slug} />}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 font-medium text-sm">
          {product.label}
          {product.badge && (
            <Badge size="sm" variant="info">
              {product.badge}
            </Badge>
          )}
        </span>
        <span className="text-muted-foreground text-xs leading-snug">{product.description}</span>
      </span>
    </NavigationMenu.Link>
  );
}

/** A panel: one ruled column per group, then a featured cell. */
function Panel({ columns, feature }: { columns: readonly MenuColumn[]; feature: ReactNode }) {
  return (
    <div
      className="grid grid-cols-[repeat(var(--columns),minmax(0,1fr))_minmax(0,1.25fr)]"
      style={{ ["--columns" as string]: columns.length }}
    >
      {columns.map((column) => (
        <section
          aria-label={column.title}
          className="flex flex-col gap-3 border-border/64 border-e px-3 py-5"
          key={column.title}
        >
          <span className="px-2.5 font-medium text-muted-foreground text-xs">{column.title}</span>
          <ul className="flex flex-col gap-0.5">
            {column.links.map((link) => (
              <li key={link.label}>
                <MenuEntry link={link} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="flex flex-col bg-muted/48 p-5">{feature}</div>
    </div>
  );
}

function MenuEntry({ link }: { link: MenuLink }) {
  const body = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-foreground shadow-xs/5 transition-colors group-hover:border-foreground/24">
        <HugeiconsIcon className="size-4" icon={link.icon} strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-sm">{link.label}</span>
        <span className="text-muted-foreground text-xs leading-snug">{link.description}</span>
      </span>
    </>
  );
  const className = "group flex items-start gap-3 rounded-lg px-2.5 py-2";
  return (
    <NavigationMenu.Link
      className={cn(
        className,
        "outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
      )}
      closeOnClick
      render={<Link href={link.href} />}
    >
      {body}
    </NavigationMenu.Link>
  );
}

/** The products panel's feature: the agent setup, and the one command it comes down to. */
function AgentFeature() {
  return (
    <NavigationMenu.Link
      className="group flex w-full flex-col justify-between gap-4 rounded-lg border bg-muted/48 p-4 outline-none transition-colors hover:border-foreground/24 focus-visible:border-foreground/24"
      closeOnClick
      render={<Link href="/#agents" />}
    >
      <code className="overflow-hidden whitespace-nowrap rounded-md border bg-background px-3 py-2.5 font-mono text-[0.6875rem]">
        <span className="text-muted-foreground">$ </span>npx coss-cli init --agents
      </code>
      <span className="flex flex-col gap-1">
        <span className="font-medium text-sm">Set up coss.com with your agent</span>
        <span className="text-muted-foreground text-xs leading-snug">
          One prompt for Claude Code, Cursor or Codex: it installs the SDK and wires up the parts
          you pick.
        </span>
      </span>
      <span className="flex items-center gap-1 font-medium text-xs">
        Get the prompt
        <HugeiconsIcon
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          icon={ArrowRight01Icon}
          strokeWidth={2}
        />
      </span>
    </NavigationMenu.Link>
  );
}

/** The developers panel's feature: the install line and where it leads. */
function InstallFeature() {
  return (
    <NavigationMenu.Link
      className="group flex h-full flex-col justify-between gap-4 rounded-lg border bg-background p-4 outline-none transition-colors hover:border-foreground/24 focus-visible:border-foreground/24"
      closeOnClick
      render={<Link href="/docs/quickstart" />}
    >
      <code className="rounded-md border bg-muted/50 px-3 py-2.5 font-mono text-xs">
        <span className="text-muted-foreground">$ </span>npm install coss
      </code>
      <span className="flex flex-col gap-1">
        <span className="font-medium text-sm">One SDK for every product</span>
        <span className="text-muted-foreground text-xs leading-snug">
          Zero dependencies. Runs on Node, Bun, Deno and Workers, and never throws for API errors.
        </span>
      </span>
      <span className="flex items-center gap-1 font-medium text-xs">
        Quickstart
        <HugeiconsIcon
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          icon={ArrowRight01Icon}
          strokeWidth={2}
        />
      </span>
    </NavigationMenu.Link>
  );
}
