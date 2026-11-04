import "server-only";
import { loader } from "fumadocs-core/source";
import { products, solutions } from "./collections";
import { renderSheetComponents } from "./sheet-markdown";
import { SITE_URL } from "./site";
import { renderTableComponents } from "./source";

/*
 * The product pages (/products/<slug>, content/products) and solution pages (/solutions/<slug>,
 * content/solutions): MDX collections of their own, out of the docs' sidebar, search and page
 * tree, each listed in /llms.txt with a `.md` twin.
 */

export const PRODUCTS_ROUTE = "/products";
export const SOLUTIONS_ROUTE = "/solutions";

export const productSource = loader({
  source: products.toFumadocsSource(),
  baseUrl: PRODUCTS_ROUTE,
});

export const solutionSource = loader({
  source: solutions.toFumadocsSource(),
  baseUrl: SOLUTIONS_ROUTE,
});

export type ProductPage = NonNullable<ReturnType<typeof productSource.getPage>>;
export type SolutionPage = NonNullable<ReturnType<typeof solutionSource.getPage>>;

/** A collection's pages in its meta.json order. */
function ordered<T extends { url: string }>(source: {
  getPageTree(): { children: { type: string; url?: string }[] };
  getPages(): T[];
}): T[] {
  const pages = new Map(source.getPages().map((page) => [page.url, page]));
  return source
    .getPageTree()
    .children.flatMap((node) => (node.type === "page" && node.url ? [pages.get(node.url)] : []))
    .filter((page): page is T => page !== undefined);
}

export function productPages(): ProductPage[] {
  return ordered(productSource);
}

export function solutionPages(): SolutionPage[] {
  return ordered(solutionSource);
}

export function productBySlug(slug: string): ProductPage | undefined {
  return productSource.getPage([slug]);
}

export function solutionBySlug(slug: string): SolutionPage | undefined {
  return solutionSource.getPage([slug]);
}

/** Where a product or solution page's Markdown is served: `/products/inboxes.md`. */
export function marketingMarkdownUrl(url: string): string {
  return `${url}.md`;
}

/** A product or solution page as Markdown, with its FAQ. */
export async function marketingMarkdown(page: ProductPage | SolutionPage): Promise<string> {
  const { title, description, faq } = page.data;
  const body = renderTableComponents(renderSheetComponents(await page.data.getText("processed")));
  const questions = faq.length
    ? `\n\n## Frequently asked questions\n\n${faq
        .map(({ question, answer }) => `### ${question}\n\n${answer}`)
        .join("\n\n")}`
    : "";
  return `# ${title} (${SITE_URL}${page.url})\n\n> ${description ?? ""}\n\n${body.trim()}${questions}\n`;
}
