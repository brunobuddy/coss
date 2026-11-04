"use client";
import { Button } from "@coss/ui/components/button";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandDialogTrigger,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "@coss/ui/components/command";
import { Kbd, KbdGroup } from "@coss/ui/components/kbd";
import {
  ArrowTurnBackwardIcon,
  BookOpen02Icon,
  Search01Icon,
  TextIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as PageTree from "fumadocs-core/page-tree";
import { useDocsSearch } from "fumadocs-core/search/client";
import Link from "next/link";
import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from "react";
import { allGroups } from "@/lib/docs-tree";
import type { NavItem } from "@/lib/site";
import { useIsMac } from "@/lib/use-is-mac";

interface MenuItem {
  /** Unique within the list (Base UI keys highlighting by it). */
  value: string;
  label: ReactNode;
  url: string;
  /** For search hits inside a page: the section's text. */
  kind: "page" | "section";
}

interface MenuGroup {
  /** Unique within the list. */
  value: string;
  /** Shown instead of `value` when they differ. */
  label?: string;
  items: MenuItem[];
}

/**
 * The ⌘K menu of coss.com/ui, backed by Fumadocs' search (`/docs/search.json`): an empty query lists
 * the site's sections and every docs page; a query shows the pages and sections matching it.
 */
export function CommandMenu({
  tree,
  navItems,
  searchApi,
  ...props
}: ComponentProps<typeof CommandDialog> & {
  tree: PageTree.Root;
  navItems: readonly NavItem[];
  /** Fumadocs' search endpoint of that tree. */
  searchApi: string;
}) {
  const isMac = useIsMac();
  const [open, setOpen] = useState(false);
  const { search, setSearch, query } = useDocsSearch({ type: "fetch", api: searchApi }, [
    searchApi,
  ]);

  const pageGroups = useMemo<MenuGroup[]>(() => {
    const groups: MenuGroup[] = [
      {
        value: "Pages",
        items: navItems.map((item) => ({
          value: `nav ${item.href}`,
          label: item.label,
          url: item.href,
          kind: "page",
        })),
      },
    ];
    for (const group of allGroups(tree)) {
      const label = typeof group.label === "string" ? group.label : String(group.label);
      groups.push({
        value: `${label} ${group.key}`,
        label,
        items: group.pages.map((page) => ({
          value: `${label} ${page.url}`,
          label: page.name,
          url: page.url,
          kind: "page",
        })),
      });
    }
    return groups;
  }, [tree, navItems]);

  const resultGroups = useMemo<MenuGroup[]>(() => {
    if (query.data === "empty") return pageGroups;
    const groups: MenuGroup[] = [];
    let current: MenuGroup | undefined;
    for (const hit of query.data) {
      if (hit.type === "page" || !current) {
        current = { value: hit.type === "page" ? hit.content : "Results", items: [] };
        groups.push(current);
        if (hit.type === "page") {
          current.items.push({ value: hit.id, label: hit.content, url: hit.url, kind: "page" });
          continue;
        }
      }
      current.items.push({ value: hit.id, label: hit.content, url: hit.url, kind: "section" });
    }
    return groups;
  }, [query.data, pageGroups]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || event.key === "/") {
        if (
          (event.target instanceof HTMLElement && event.target.isContentEditable) ||
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement
        ) {
          return;
        }
        event.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <CommandDialog onOpenChange={setOpen} open={open} {...props}>
      <CommandDialogTrigger
        className="w-52 justify-start text-muted-foreground"
        render={<Button variant="outline" />}
      >
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        Search
        <KbdGroup className="ms-auto gap-1">
          <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd className="aspect-square">K</Kbd>
        </KbdGroup>
      </CommandDialogTrigger>
      <CommandDialogPopup>
        <Command
          filter={null}
          items={resultGroups}
          itemToStringValue={(item) => {
            const { label, url } = item as MenuItem;
            return typeof label === "string" ? label : url;
          }}
          onValueChange={setSearch}
          value={search}
        >
          <CommandInput placeholder="Search documentation…" />
          <CommandPanel>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandList>
              {(group: MenuGroup) => (
                <CommandGroup items={group.items} key={group.value}>
                  <CommandGroupLabel>{group.label ?? group.value}</CommandGroupLabel>
                  <CommandCollection>
                    {(item: MenuItem) => (
                      <CommandItem
                        className="flex w-full items-center"
                        key={item.value}
                        render={<Link href={item.url} onNavigate={() => setOpen(false)} />}
                      >
                        <HugeiconsIcon
                          className="mr-2 h-4 w-4 shrink-0 opacity-80"
                          icon={item.kind === "page" ? BookOpen02Icon : TextIcon}
                          strokeWidth={2}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">Go to Page</span>
              <Kbd>
                <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={2} />
              </Kbd>
            </div>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
