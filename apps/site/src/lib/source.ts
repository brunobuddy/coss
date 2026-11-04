import "server-only";
import spec from "@coss/api/openapi.json";
import snippets from "@coss/sdkgen/snippets.json";
import type { StructuredData } from "fumadocs-core/mdx-plugins";
import { loader } from "fumadocs-core/source";
import { operationsMarkdown, sectionsMarkdown } from "../components/docs-sections";
import { renderApiKeyComponents } from "./api-key-permissions-text";
import { renderBillingComponents } from "./billing-text";
import { docs } from "./collections";
import { createDocsSearch, type SearchablePage } from "./docs-search";
import { sectionsOf } from "./docs-tree";
import { kebabCase } from "./kebab-case";
import { openapi } from "./openapi";
import {
  createOperationMarkdown,
  type OpenApiDocument,
  type ReferencedOperation,
} from "./operation-markdown";
import { renderRateLimitComponents } from "./rate-limits-text";
import { renderReputationComponents } from "./reputation-text";
import { renderRetentionComponents } from "./retention-text";
import { renderRiskComponents } from "./risk-text";
import { DOCS_ROUTE, SITE_URL } from "./site";

/**
 * Every docs page: MDX from content/docs, plus one virtual page per API operation under
 * /docs/api-reference/<tag>/… (content/docs/api-reference/meta.json places them in the sidebar).
 */
export const source = loader(
  {
    docs: docs.toFumadocsSource(),
    openapi: await apiReferenceSource(),
  },
  {
    baseUrl: DOCS_ROUTE,
    plugins: [openapi.loaderPlugin()],
  },
);

/**
 * The API operations, one folder per tag. Each tag's meta.json gives its display name ("Dedicated
 * IPs") and the operations in the document's order; the root one is dropped, since
 * content/docs/api-reference/meta.json groups the tags by product.
 */
async function apiReferenceSource() {
  const { files } = await openapi.staticSource({
    baseDir: "api-reference",
    per: "operation",
    groupBy: "tag",
    meta: true,
    // operationId `sendEmail` → /docs/api-reference/emails/send-email
    name(output) {
      if (output.type !== "operation") return kebabCase(output.item.name);
      const { path, method } = output.item;
      const id = this.document.paths?.[path]?.[method]?.operationId;
      if (!id) throw new Error(`${method.toUpperCase()} ${path} needs an operationId.`);
      return kebabCase(id);
    },
  });
  // Fumadocs titles a tag from its name word by word ("Dedicated I Ps"): use the name as written.
  const tags = new Map<string, string>();
  for (const operations of Object.values(spec.paths)) {
    for (const operation of Object.values(operations)) {
      for (const tag of operation.tags ?? []) tags.set(kebabCase(tag), tag);
    }
  }
  return {
    files: files
      .filter((file) => file.path !== "api-reference/meta.json")
      .map((file) => {
        const tag = file.type === "meta" && tags.get(file.path.split("/")[1] ?? "");
        return tag ? { ...file, data: { ...file.data, title: tag } } : file;
      }),
  };
}

export type DocsPage = NonNullable<ReturnType<typeof source.getPage>>;

const document = spec as unknown as OpenApiDocument;
const operationMarkdown = createOperationMarkdown(document);

/** Each API operation by its page's URL (`apiReferenceSource` names them the same way). */
const OPERATIONS = new Map<string, ReferencedOperation>(
  Object.entries(document.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, operation]): [string, ReferencedOperation] => {
      const tag = kebabCase(operation.tags?.[0] ?? "");
      const url = `${DOCS_ROUTE}/api-reference/${tag}/${kebabCase(operation.operationId ?? "")}`;
      return [url, { method, path, operation }];
    }),
  ),
);

/** The operation an API reference page documents. */
export function operationOf(page: DocsPage): ReferencedOperation {
  const operation = OPERATIONS.get(page.url);
  if (!operation) throw new Error(`No operation in the OpenAPI document for ${page.url}.`);
  return operation;
}

/** Where a docs page's Markdown is served: `/docs/email/sending` → `/docs/email/sending.md`. */
export function markdownUrl(url: string): string {
  return url === DOCS_ROUTE ? `${DOCS_ROUTE}/index.md` : `${url}.md`;
}

/**
 * A page as Markdown: `<page>.md`, the "Copy Markdown" button and /llms-full.txt. API operations
 * list their parameters, bodies, responses and samples; `compact` keeps one short entry instead
 * (/llms-full.txt, which links each page's `.md` for the rest).
 */
export async function pageMarkdown(
  page: DocsPage,
  { compact = false }: { compact?: boolean } = {},
): Promise<string> {
  const heading = `# ${page.data.title} (${page.url})`;
  if (page.type === "openapi") {
    const operation = operationOf(page);
    const body = compact
      ? operationMarkdown.summary(operation, `${SITE_URL}${markdownUrl(page.url)}`)
      : operationMarkdown.full(operation, { snippets });
    return `${heading}\n\n${body}`;
  }
  const sections = sectionsOf(source.getPageTree());
  const body = (await page.data.getText("processed"))
    .replaceAll("<DocsSections />", sectionsMarkdown(sections))
    .replaceAll(
      "<ApiOperations />",
      operationsMarkdown(sections.find((section) => section.url === page.url)),
    );
  return `${heading}\n\n${renderTableComponents(body)}`;
}

/**
 * The generated tables (plans, rates, retention, risk reasons, key permissions, reputation
 * thresholds, API rate limits) as Markdown.
 */
export function renderTableComponents(markdown: string): string {
  return renderRateLimitComponents(
    renderReputationComponents(
      renderApiKeyComponents(
        renderRiskComponents(renderBillingComponents(renderRetentionComponents(markdown))),
      ),
    ),
  );
}

/** A page as the docs' search indexes it. */
async function searchablePage(page: DocsPage): Promise<SearchablePage> {
  const data = page.data as {
    structuredData?: StructuredData | (() => Promise<StructuredData>);
    load?: () => Promise<{ structuredData: StructuredData }>;
  };
  const structuredData =
    typeof data.structuredData === "function"
      ? await data.structuredData()
      : (data.structuredData ?? (await data.load?.())?.structuredData);
  if (!structuredData) throw new Error(`${page.url} has no structured data to search.`);
  return {
    url: page.url,
    title: page.data.title ?? page.url,
    description: page.data.description,
    structuredData,
    ...(page.type === "openapi"
      ? { keywords: `${operationOf(page).method} ${operationOf(page).path}` }
      : {}),
  };
}

/** /docs/search.json (src/lib/docs-search.ts). */
export const docsSearch = createDocsSearch(async () => {
  const tree = source.getPageTree();
  return {
    pages: await Promise.all(source.getPages().map(searchablePage)),
    tree,
    overviews: new Set(sectionsOf(tree).map((section) => section.url)),
  };
});
