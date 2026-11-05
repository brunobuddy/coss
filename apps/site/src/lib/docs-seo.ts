import "server-only";
import { COMPARE_ROUTE, competitorsFor } from "./compare";
import { type DocsSection, type NavPage, sectionsOf } from "./docs-tree";
import { PRODUCTS_ROUTE, type ProductPage, productBySlug, productPages } from "./marketing";
import { metaDescription } from "./seo";
import { SITE_NAME } from "./site";
import { type DocsPage, operationOf, source } from "./source";

/** Where a page sits in the sidebar: its section, and for an API operation its product. */
function placements(): Map<string, { section: DocsSection; product?: string }> {
  const map = new Map<string, { section: DocsSection; product?: string }>();
  for (const section of sectionsOf(source.getPageTree())) {
    for (const group of section.groups) {
      for (const entry of group.entries) {
        if (entry.type === "page") map.set(entry.url, { section });
        else {
          for (const page of entry.pages as NavPage[]) {
            map.set(page.url, { section, product: String(group.label) });
          }
        }
      }
    }
    map.set(section.url, map.get(section.url) ?? { section });
  }
  return map;
}

const placed = placements();

export function docsSection(page: DocsPage): DocsSection | undefined {
  return placed.get(page.url)?.section;
}

/**
 * The docs page's `<title>`. H1s like "Testing" read well in their section but not in a list of
 * search results, so the section (or an API operation's product) goes in the title.
 */
export function docsTitle(page: DocsPage): string {
  if (page.type !== "openapi" && page.data.seoTitle) return page.data.seoTitle;
  const title = page.data.title ?? "";
  const place = placed.get(page.url);
  if (place?.product) return `${title} – ${place.product} API · ${SITE_NAME}`;
  const section = place ? String(place.section.name) : "";
  if (!section) return `${title} · ${SITE_NAME}`;
  if (section === title) return `${title} docs · ${SITE_NAME}`;
  return `${title} – ${section} · ${SITE_NAME}`;
}

export function docsDescription(page: DocsPage): string {
  if (page.type !== "openapi") return metaDescription(page.data.description ?? "");
  const { method, path } = operationOf(page);
  const endpoint = `${method.toUpperCase()} ${path} in the ${SITE_NAME} API, with its parameters, responses and code samples.`;
  const text = metaDescription(page.data.description ?? "");
  if (!text) return metaDescription(`${page.data.title}: ${endpoint}`);
  return text.length < 70 ? metaDescription(`${text} ${endpoint}`) : text;
}

/** The product a docs page is about: the longest `docs` path of a product page that holds it. */
function productOf(page: DocsPage): ProductPage | undefined {
  const holding = productPages()
    .filter(({ data }) => page.url === data.docs || page.url.startsWith(`${data.docs}/`))
    .sort((a, b) => b.data.docs.length - a.data.docs.length);
  if (holding[0]) return holding[0];
  return page.slugs[0] === "email" ? productBySlug("email") : undefined;
}

/** Links from a docs page to what explains and prices its product (the docs' only path there). */
export function docsRelated(page: DocsPage): { title: string; url: string }[] {
  const product = productOf(page);
  const pricing = { title: "Pricing", url: "/pricing" };
  if (!product) {
    return [
      { title: "Products", url: PRODUCTS_ROUTE },
      pricing,
      { title: "Compare coss.com", url: COMPARE_ROUTE },
    ];
  }
  return [
    { title: `coss.com ${product.data.title}`, url: product.url },
    pricing,
    ...competitorsFor(product.slugs[0] ?? "")
      .slice(0, 3)
      .map((c) => ({ title: `coss.com vs ${c.name}`, url: `${COMPARE_ROUTE}/${c.slug}` })),
  ];
}
