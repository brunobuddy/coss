import type { Node, Root } from "fumadocs-core/page-tree";
import { findPath } from "fumadocs-core/page-tree";
import {
  type AdvancedIndex,
  type Index,
  initAdvancedSearch,
  initSimpleSearch,
} from "fumadocs-core/search/server";
import { SEARCH_KEYWORDS, searchTokens } from "./docs-search-text";

/*
 * The docs' search, behind /docs/search.json (the ⌘K menu and the MCP server's `search_docs`).
 * Fumadocs' stock index ranks single passages, so one matching sentence in a long page beats a page
 * that is about the query. Here two indexes answer each query:
 *
 * - One document per page, with its title, keywords, description and text as weighted fields,
 *   decides the order of the pages.
 * - Fumadocs' passage index (one document per heading and paragraph) finds what to show under each.
 *
 * The response is what Fumadocs' endpoint returns: each page's `page` hit, then its `heading` and
 * `text` hits.
 */

/** How much a match in each field of a page counts. */
const FIELD_WEIGHTS = { title: 10, keywords: 6, description: 4, content: 1 };

/** Passages shown under each page: the ⌘K menu lists them, `search_docs` keeps three. */
const PASSAGES_PER_PAGE = 3;
/** Fumadocs' default number of hits in a response. */
const DEFAULT_LIMIT = 60;
/** How many passages to look through for the pages a response shows. */
const PASSAGE_CANDIDATES = 500;

/** What a page's search index needs from it (`source.getPages()`). */
export interface SearchablePage {
  url: string;
  title: string;
  description?: string;
  /** Terms for the page alone (an API operation's method and path). */
  keywords?: string;
  structuredData: AdvancedIndex["structuredData"];
}

export interface DocsSearchHit {
  id: string;
  type: "page" | "heading" | "text";
  content: string;
  url: string;
  breadcrumbs?: string[];
}

const API_OPERATION = /^\/docs\/api-reference\/[^/]+\/[^/]+$/;

/**
 * How much a page's kind counts: someone asking how to do something wants its guide before the
 * endpoints, and a product's overview first. An API operation still wins a query naming it, because
 * its title matches outright.
 */
function pagePrior(url: string, overviews: ReadonlySet<string>): number {
  if (API_OPERATION.test(url)) return 0.45;
  if (overviews.has(url)) return 1.5;
  return 1;
}

/** The tokenizer of both indexes, in the shape zbsearch's `create` takes. */
const tokenizer = {
  language: "english",
  normalizationCache: new Map<string, string>(),
  tokenize: (text: string) => searchTokens(text),
};

/** The folders and separators a page sits under, as Fumadocs' own index gives them. */
function breadcrumbsOf(tree: Root, url: string): string[] {
  const path = findPath(tree.children, (node: Node) => node.type === "page" && node.url === url);
  if (!path) return [];
  path.pop();
  return [tree.name, ...path.map((node: Node) => node.name)].filter(
    (name): name is string => typeof name === "string" && name.length > 0,
  );
}

async function buildIndexes(pages: SearchablePage[], tree: Root, overviews: ReadonlySet<string>) {
  const indexed = pages.map((page) => ({ ...page, breadcrumbs: breadcrumbsOf(tree, page.url) }));
  const pageDocuments: Index[] = indexed.map((page) => ({
    title: page.title,
    description: page.description,
    breadcrumbs: page.breadcrumbs,
    url: page.url,
    keywords: [
      SEARCH_KEYWORDS[page.url],
      page.keywords,
      ...page.structuredData.headings.map((heading) => heading.content),
    ]
      .filter(Boolean)
      .join(" "),
    content: page.structuredData.contents.map((item) => item.content).join("\n"),
  }));
  const passageDocuments: AdvancedIndex[] = indexed.map((page) => ({
    id: page.url,
    url: page.url,
    title: page.title,
    description: page.description,
    breadcrumbs: page.breadcrumbs,
    structuredData: page.structuredData,
  }));
  return {
    pages: initSimpleSearch({
      indexes: pageDocuments,
      tokenizer,
      search: {
        tolerance: 0,
        properties: ["title", "keywords", "description", "content"],
        boost: FIELD_WEIGHTS,
        sortBy: ([, scoreA, a], [, scoreB, b]) =>
          scoreB * pagePrior(b.url, overviews) - scoreA * pagePrior(a.url, overviews),
      },
    }),
    passages: initAdvancedSearch({
      indexes: passageDocuments,
      tokenizer,
      search: { groupBy: { properties: ["page_id"], maxResult: PASSAGES_PER_PAGE } },
    }),
  };
}

/**
 * The search over a set of pages. The indexes are built on the first query, so a task that never
 * serves one never pays for them.
 */
export function createDocsSearch(
  load: () => Promise<{
    pages: SearchablePage[];
    tree: Root;
    /** URLs of the sections' own pages: they rank above the pages under them. */
    overviews: ReadonlySet<string>;
  }>,
) {
  let indexes: ReturnType<typeof buildIndexes> | undefined;
  const ready = () => {
    indexes ??= load().then(({ pages, tree, overviews }) => buildIndexes(pages, tree, overviews));
    indexes.catch(() => {
      indexes = undefined;
    });
    return indexes;
  };

  async function search(query: string, limit = DEFAULT_LIMIT): Promise<DocsSearchHit[]> {
    const { pages, passages } = await ready();
    const ranked = await pages.search(query, { limit });
    if (ranked.length === 0) return [];
    const under = new Map<string, DocsSearchHit[]>();
    for (const hit of await passages.search(query, { limit: PASSAGE_CANDIDATES })) {
      if (hit.type === "page") continue;
      const page = hit.url.replace(/#.*$/, "");
      under.set(page, [...(under.get(page) ?? []), hit as DocsSearchHit]);
    }
    return ranked
      .flatMap((page) => [page as DocsSearchHit, ...(under.get(page.url) ?? [])])
      .slice(0, limit);
  }

  return {
    search,
    /** Fumadocs' endpoint: `?query=` (and `limit`), an empty list without a query. */
    async GET(request: Request): Promise<Response> {
      const params = new URL(request.url).searchParams;
      const query = params.get("query");
      if (!query) return Response.json([]);
      const limit = Number(params.get("limit"));
      return Response.json(
        await search(query, Number.isInteger(limit) && limit > 0 ? limit : undefined),
      );
    },
  };
}
