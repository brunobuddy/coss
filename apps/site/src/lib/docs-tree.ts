import type * as PageTree from "fumadocs-core/page-tree";
import type { ReactNode } from "react";

/** A link in the sidebar, the mobile menu or the command menu. */
export interface NavPage {
  name: ReactNode;
  url: string;
}

/** A folder inside a group (an API resource): collapsible in the sidebar. */
export interface NavFolder {
  type: "folder";
  /** Stable across renders: the first page's URL. */
  key: string;
  name: ReactNode;
  pages: NavPage[];
}

/** What a sidebar group lists: pages, and folders of pages. */
export type NavEntry = ({ type: "page" } & NavPage) | NavFolder;

/** A labelled run of pages: a root's leading pages, a `---Separator---`, or a nested folder. */
export interface NavGroup {
  /** Stable across renders: the first page's URL. */
  key: string;
  /** Empty for a root's leading pages: the section's name already says what they are. */
  label: ReactNode;
  entries: NavEntry[];
  /** Every page of the group, folders flattened. */
  pages: NavPage[];
}

/**
 * A part of the docs with a sidebar of its own (Get started, Email, …, API reference): a top-level
 * folder marked `"root": true` in its meta.json, which also gives its description and icon name.
 */
export interface DocsSection {
  key: string;
  name: ReactNode;
  description?: ReactNode;
  /** The meta.json `icon` name (`SECTION_ICONS` in the sidebar). */
  icon?: string;
  /** Where the section starts: its index, else its first page. */
  url: string;
  groups: NavGroup[];
}

/**
 * The top-level folders marked `"root": true` in their meta.json (coss's docs: one per section).
 * A tree without any (Shipyard's and kloq's docs) is one root itself.
 */
export function rootFolders(tree: PageTree.Root): PageTree.Folder[] {
  const roots = tree.children.filter(
    (node): node is PageTree.Folder => node.type === "folder" && !!node.root,
  );
  if (roots.length > 0) return roots;
  return [{ type: "folder", name: tree.name, children: tree.children }];
}

/** The root folder holding the current page (the first root when nothing matches). */
export function activeRoot(tree: PageTree.Root, pathname: string): PageTree.Folder | undefined {
  const roots = rootFolders(tree);
  return (
    roots.find((root) => pagesOf(root).some((page) => page.url === pathname)) ??
    roots.find((root) => pagesOf(root).some((page) => pathname.startsWith(`${page.url}/`))) ??
    roots[0]
  );
}

/**
 * The tree without nested folders inside root folders: what the header needs outside the docs,
 * where every API operation would otherwise be serialized into each page. Search still finds them.
 */
export function withoutNestedFolders(tree: PageTree.Root): PageTree.Root {
  return {
    ...tree,
    children: tree.children.map((node) =>
      node.type === "folder" && node.root
        ? { ...node, children: node.children.filter((child) => child.type !== "folder") }
        : node,
    ),
  };
}

/** The sections of the docs, in sidebar order: one per root folder. */
export function sectionsOf(tree: PageTree.Root): DocsSection[] {
  return rootFolders(tree).map((root) => {
    const groups = groupsOf(root);
    const url = root.index?.url ?? groups[0]?.pages[0]?.url ?? "";
    return {
      key: url,
      name: root.name,
      description: root.description,
      icon: typeof root.icon === "string" ? root.icon : undefined,
      url,
      groups,
    };
  });
}

/** The section holding the current page (the first when nothing matches). */
export function activeSection(tree: PageTree.Root, pathname: string): DocsSection | undefined {
  const sections = sectionsOf(tree);
  const root = activeRoot(tree, pathname);
  return (root && sections[rootFolders(tree).indexOf(root)]) || sections[0];
}

/** The sidebar's groups for the current page: those of its section. */
export function navGroups(tree: PageTree.Root, pathname: string): NavGroup[] {
  return activeSection(tree, pathname)?.groups ?? [];
}

/**
 * Every group of every section (the command menu), each labelled with its section when there are
 * several ("Email · Deliverability").
 */
export function allGroups(tree: PageTree.Root): NavGroup[] {
  const sections = sectionsOf(tree);
  if (sections.length === 1) {
    return (sections[0]?.groups ?? []).map((group) => ({
      ...group,
      label: group.label || sections[0]?.name,
    }));
  }
  return sections.flatMap((section) =>
    section.groups.map((group) => ({
      ...group,
      label:
        group.label && typeof group.label === "string" && typeof section.name === "string"
          ? `${section.name} · ${group.label}`
          : group.label || section.name,
    })),
  );
}

/** The pages before and after the current one in its section, for the links under a page. */
export function neighbours(
  tree: PageTree.Root,
  pathname: string,
): { previous?: NavPage; next?: NavPage } {
  const pages = (activeSection(tree, pathname)?.groups ?? []).flatMap((group) => group.pages);
  const index = pages.findIndex((page) => page.url === pathname);
  if (index === -1) return {};
  return { previous: pages[index - 1], next: pages[index + 1] };
}

/**
 * A folder as sidebar groups: its index and leading pages (unlabelled), then one group per
 * separator. A folder under a separator is an entry of that group (an API resource, collapsible);
 * one outside any separator becomes a group of its own (Shipyard's docs).
 */
export function groupsOf(folder: PageTree.Folder): NavGroup[] {
  const groups: NavGroup[] = [];
  let current: { label: ReactNode; entries: NavEntry[] } = { label: "", entries: [] };
  let underSeparator = false;
  const flush = () => {
    if (current.entries.length > 0) groups.push(toGroup(current.label, current.entries));
  };
  const has = (url: string) =>
    current.entries.some((entry) => entry.type === "page" && entry.url === url);
  // The index leads, unless meta.json places it ("index" under Risk's first separator).
  const placed = folder.children.some(
    (node) => node.type === "page" && node.url === folder.index?.url,
  );
  if (folder.index && !placed) current.entries.push(page(folder.index, folder));
  for (const node of folder.children) {
    if (node.type === "page") {
      if (!has(node.url)) current.entries.push(page(node, folder));
    } else if (node.type === "separator") {
      flush();
      current = { label: node.name ?? "", entries: [] };
      underSeparator = true;
    } else if (underSeparator) {
      const pages = pagesOf(node);
      const first = pages[0];
      if (first) {
        current.entries.push({
          type: "folder",
          key: first.url,
          name: folderName(node.name, current.label),
          pages,
        });
      }
    } else {
      flush();
      const pages = pagesOf(node);
      if (pages.length > 0) groups.push(toGroup(node.name, pages.map(asEntry)));
      current = { label: "", entries: [] };
    }
  }
  flush();
  return groups;
}

/** Every page of a folder, in sidebar order (its index first). */
export function pagesOf(folder: PageTree.Folder): NavPage[] {
  const pages: NavPage[] = [];
  const seen = new Set<string>();
  const add = (page: NavPage) => {
    if (seen.has(page.url)) return;
    seen.add(page.url);
    pages.push(page);
  };
  if (folder.index) add(folder.index);
  for (const node of folder.children) {
    if (node.type === "page") add(node);
    else if (node.type === "folder") for (const page of pagesOf(node)) add(page);
  }
  return pages;
}

function toGroup(label: ReactNode, entries: NavEntry[]): NavGroup {
  const pages = entries.flatMap((entry) =>
    entry.type === "folder" ? entry.pages : [{ name: entry.name, url: entry.url }],
  );
  return { key: pages[0]?.url ?? "", label, entries, pages };
}

function asEntry(page: NavPage): NavEntry {
  return { type: "page", name: page.name, url: page.url };
}

/** A page as an entry; one named like its folder (Hooks' index, "Hooks") reads "Overview". */
function page(node: PageTree.Item, folder: PageTree.Folder): NavEntry {
  const name = node.name === folder.name ? "Overview" : node.name;
  return { type: "page", name, url: node.url };
}

/**
 * A folder's name without its group's ("Hooks applications" under Hooks reads "Applications"); a
 * folder named like its group (Risk's one API tag) reads "Endpoints".
 */
function folderName(name: ReactNode, label: ReactNode): ReactNode {
  if (typeof name !== "string" || typeof label !== "string" || !label) return name;
  if (name.toLowerCase() === label.toLowerCase()) return "Endpoints";
  const prefix = `${label.toLowerCase()} `;
  if (!name.toLowerCase().startsWith(prefix)) return name;
  const rest = name.slice(prefix.length);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
