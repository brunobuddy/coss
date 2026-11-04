import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { failWith, ok } from "../result.ts";
import { READ_ONLY } from "./shared.ts";

/** Where the docs are read from: coss.com's public docs, which need no API key. */
export interface DocsOptions {
  /** The site's origin (default `https://coss.com`). */
  baseUrl?: string;
  /** Overrides the global `fetch` (tests). */
  fetch?: typeof fetch;
}

export const DEFAULT_DOCS_URL = "https://coss.com";

/** A page of the docs is read in pieces of at most this many characters. */
const PAGE_LIMIT = 40_000;

/** One hit of the docs' search (`/docs/search.json`, Fumadocs' search server). */
interface SearchHit {
  id: string;
  type: "page" | "heading" | "text";
  content: string;
  url: string;
  breadcrumbs?: string[];
}

/** `/docs/email/sending#tags` → `/docs/email/sending.md`; `/docs` → `/docs/index.md`. */
export function markdownPath(page: string): string {
  const path = page.replace(/#.*$/, "").replace(/\/+$/, "").replace(/\.md$/, "");
  return path === "/docs" ? "/docs/index.md" : `${path}.md`;
}

/** A docs page from a path or URL on the docs' own origin, or `null` for anything else. */
export function docsPath(page: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(page.trim(), `${origin}/`);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  if (url.pathname !== "/docs" && !url.pathname.startsWith("/docs/")) return null;
  return url.pathname;
}

/** The docs' origin, without trailing slashes. */
export function docsOrigin(options: DocsOptions = {}): string {
  const baseUrl = options.baseUrl ?? DEFAULT_DOCS_URL;
  let end = baseUrl.length;
  while (end > 0 && baseUrl[end - 1] === "/") end--;
  return baseUrl.slice(0, end);
}

export function registerDocsTools(server: McpServer, options: DocsOptions = {}): void {
  const origin = docsOrigin(options);
  const request = options.fetch ?? fetch;

  const get = async (path: string): Promise<Response | string> => {
    try {
      return await request(`${origin}${path}`, { signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      return `coss.com's docs could not be reached (${error instanceof Error ? error.message : String(error)}).`;
    }
  };

  server.registerTool(
    "search_docs",
    {
      title: "Search the coss.com docs",
      description:
        "Searches coss.com's documentation (guides, SDK pages and the API reference) and returns " +
        "the matching pages with the passages that matched. Read a page in full with read_docs. " +
        "Works without an API key.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(200)
          .describe('What to look for, e.g. "verify webhook signature" or "schedule an email".'),
        limit: z.number().int().min(1).max(20).default(8).describe("How many pages to return."),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, limit }) => {
      const response = await get(`/docs/search.json?query=${encodeURIComponent(query)}`);
      if (typeof response === "string") return failWith(response);
      if (!response.ok) return failWith(`The docs search answered ${response.status}.`);
      const hits = (await response.json()) as SearchHit[];
      const pages = new Map<string, { title: string; section: string[]; matches: string[] }>();
      for (const hit of hits) {
        const path = hit.url.replace(/#.*$/, "");
        const page = pages.get(path) ?? { title: "", section: [], matches: [] };
        if (hit.type === "page") {
          page.title = hit.content;
          page.section = hit.breadcrumbs ?? [];
        } else if (page.matches.length < 3) {
          page.matches.push(hit.type === "heading" ? `## ${hit.content}` : hit.content);
        }
        pages.set(path, page);
      }
      const results = [...pages].slice(0, limit).map(([path, page]) => ({
        title: page.title || path,
        section: page.section.join(" / ") || undefined,
        url: `${origin}${path}`,
        markdown_url: `${origin}${markdownPath(path)}`,
        matches: page.matches,
      }));
      return ok({
        query,
        results,
        ...(results.length === 0
          ? {
              hint: `Nothing matched: try other words, or read ${origin}/llms.txt for the guides and each product's API operations.`,
            }
          : {}),
      });
    },
  );

  server.registerTool(
    "read_docs",
    {
      title: "Read a coss.com docs page",
      description:
        "One page of coss.com's documentation as Markdown: a guide, an SDK page, or an API " +
        "reference page (method and URL, parameters, request body, responses, errors and " +
        "examples in each SDK). Takes a path from search_docs or a docs link, e.g. " +
        '"/docs/email/sending" or "/docs/api-reference/emails/send-email"; "/docs" is the ' +
        "index of every section. Works without an API key.",
      inputSchema: z.object({
        page: z.string().min(1).describe('The page\'s path or URL, e.g. "/docs/webhooks".'),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Character to start from, for a page longer than one answer (`next_offset`)."),
      }),
      annotations: READ_ONLY,
    },
    async ({ page, offset }) => {
      const path = docsPath(page, origin);
      if (!path) {
        return failWith(
          `"${page}" is not a page of ${origin}/docs: pass a path like /docs/webhooks.`,
        );
      }
      const response = await get(markdownPath(path));
      if (typeof response === "string") return failWith(response);
      if (response.status === 404) {
        return failWith(`${origin}${path} doesn't exist. Find the page with search_docs.`);
      }
      if (!response.ok) return failWith(`The docs answered ${response.status} for ${path}.`);
      const text = await response.text();
      const end = Math.min(text.length, offset + PAGE_LIMIT);
      return {
        content: [
          {
            type: "text",
            text:
              text.slice(offset, end) +
              (end < text.length
                ? `\n\n[The page continues: call read_docs with offset ${end} (next_offset).]`
                : ""),
          },
        ],
      };
    },
  );
}
