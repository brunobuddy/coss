/**
 * The product, solution and comparison pages (content/products, content/solutions,
 * src/lib/compare-data): what search engines and answer engines read from them, and the links
 * between them and the docs. Pages are read from disk: the MDX collections only load in Next.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FEATURE_KEYS, LIMIT_KEYS, METER_KEYS, PLAN_KEYS } from "@coss/billing/catalog";
import { renderInlineBillingComponents } from "../src/lib/billing-text";
import { COMPARE_ROUTE, COMPETITORS } from "../src/lib/compare";
import { BRIEF_ABOVE, briefCell } from "../src/lib/compare-briefs";
import { MARKS, PRODUCT_GROUPS } from "../src/lib/marks";
import {
  ALL_PRODUCT_LINKS,
  DEVELOPER_COLUMNS,
  FOOTER_COLUMNS,
  PLATFORM_LINKS,
} from "../src/lib/nav";
import { pagePricing } from "../src/lib/page-pricing";
import { PRODUCT_VISUALS } from "../src/lib/product-visuals";
import { renderSheetComponents } from "../src/lib/sheet-markdown";
import { TOOLS_ROUTE } from "../src/lib/tools";

const ROOT = path.resolve(import.meta.dir, "..");

interface Page {
  slug: string;
  file: string;
  data: Record<string, unknown>;
  body: string;
}

function pages(dir: string): Page[] {
  const folder = path.join(ROOT, "content", dir);
  return readdirSync(folder)
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => {
      const file = path.join(folder, name);
      const text = readFileSync(file, "utf8");
      const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
      if (!match?.[1]) throw new Error(`${file} has no frontmatter.`);
      return {
        slug: name.replace(/\.mdx$/, ""),
        file,
        data: Bun.YAML.parse(match[1]) as Record<string, unknown>,
        body: match[2] ?? "",
      };
    });
}

const products = pages("products");
const solutions = pages("solutions");
const productSlugs = new Set(products.map((page) => page.slug));
const solutionSlugs = new Set(solutions.map((page) => page.slug));
const competitorSlugs = new Set(COMPETITORS.map((c) => c.slug));

/** The docs page a `/docs/…` path is served from (route groups `(x)` are URL-less). */
function docsPageExists(url: string): boolean {
  const [pathname] = url.split("#");
  const parts = (pathname ?? "")
    .replace(/^\/docs\/?/, "")
    .split("/")
    .filter(Boolean);
  if (parts[0] === "api-reference" && parts.length > 2) return true; // generated operations
  const candidates = (dir: string, rest: string[]): boolean => {
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    const groups = entries.filter((entry) => entry.startsWith("("));
    if (!rest.length) {
      return (
        entries.includes("index.mdx") ||
        groups.some((group) => existsSync(path.join(dir, group, "index.mdx")))
      );
    }
    const [head, ...tail] = rest;
    if (!tail.length && entries.includes(`${head}.mdx`)) return true;
    if (entries.includes(head ?? "") && candidates(path.join(dir, head ?? ""), tail)) return true;
    return groups.some((group) => candidates(path.join(dir, group), rest));
  };
  return candidates(path.join(ROOT, "content/docs"), parts);
}

/** Whether a site path is one of this app's pages. */
function resolves(href: string): boolean {
  const [pathname] = href.split("#");
  if (!pathname) return false;
  if (pathname.startsWith("/docs")) return docsPageExists(pathname);
  const [, section, slug] = pathname.split("/");
  if (pathname === TOOLS_ROUTE || pathname.startsWith(`${TOOLS_ROUTE}/`)) return true;
  if (section === "products") return slug === undefined || productSlugs.has(slug);
  if (section === "solutions") return slug === undefined || solutionSlugs.has(slug);
  if (section === "compare") return slug === undefined || competitorSlugs.has(slug);
  if (section === "legal") {
    return slug === undefined || existsSync(path.join(ROOT, "content/legal", `${slug}.mdx`));
  }
  return [
    "/",
    "/pricing",
    "/about",
    "/changelog",
    "/status",
    "/contact",
    "/llms.txt",
    "/llms-full.txt",
  ].includes(pathname);
}

/** `$` and a digit: a typed-in price (prices come from the catalog's components). */
const PRICE = /\$\s?\d/;

/** Internal links of a page body: Markdown links and JSX hrefs. */
function linksOf(body: string): string[] {
  const outside = body.replace(/```[\s\S]*?```/g, "");
  return [...outside.matchAll(/\]\((\/[^)\s]*)\)/g), ...outside.matchAll(/href="(\/[^"]*)"/g)].map(
    (match) => match[1] ?? "",
  );
}

function checkFaq(page: Page) {
  const faq = (page.data.faq ?? []) as { question?: unknown; answer?: unknown }[];
  for (const entry of faq) {
    expect(typeof entry.question).toBe("string");
    expect(typeof entry.answer).toBe("string");
    expect({ page: page.slug, price: PRICE.test(String(entry.answer)) }).toEqual({
      page: page.slug,
      price: false,
    });
  }
  return faq;
}

function checkCommon(page: Page) {
  const { title, description, seoTitle, headline, mark } = page.data;
  expect({
    page: page.slug,
    ok: typeof title === "string" && typeof headline === "string",
  }).toEqual({
    page: page.slug,
    ok: true,
  });
  expect(typeof seoTitle).toBe("string");
  expect(typeof description).toBe("string");
  expect({ page: page.slug, length: String(description).length <= 160 }).toEqual({
    page: page.slug,
    length: true,
  });
  expect(MARKS).toContain(mark as (typeof MARKS)[number]);
  const prose = page.body.replace(/```[\s\S]*?```/g, "");
  expect({ page: page.slug, price: prose.match(PRICE)?.[0] ?? null }).toEqual({
    page: page.slug,
    price: null,
  });
  for (const link of linksOf(page.body)) {
    expect({ page: page.slug, link, resolves: resolves(link) }).toEqual({
      page: page.slug,
      link,
      resolves: true,
    });
  }
  // The inline billing components name real meters, features, limits and plans.
  for (const [, meter] of page.body.matchAll(/meter="([^"]+)"/g)) {
    expect(METER_KEYS).toContain(meter as (typeof METER_KEYS)[number]);
  }
  for (const [, meters] of page.body.matchAll(/meters="([^"]+)"/g)) {
    for (const meter of (meters ?? "").split(",")) {
      expect(METER_KEYS).toContain(meter as (typeof METER_KEYS)[number]);
    }
  }
  for (const [, feature] of page.body.matchAll(/<PlansWith feature="([^"]+)"/g)) {
    expect(FEATURE_KEYS).toContain(feature as (typeof FEATURE_KEYS)[number]);
  }
  for (const [, limit, plan] of page.body.matchAll(/<Limit of="([^"]+)" plan="([^"]+)"/g)) {
    expect(LIMIT_KEYS).toContain(limit as (typeof LIMIT_KEYS)[number]);
    expect(PLAN_KEYS).toContain(plan as (typeof PLAN_KEYS)[number]);
  }
}

describe("product pages", () => {
  test("every page is listed in meta.json, and every listed page exists", () => {
    const meta = JSON.parse(readFileSync(path.join(ROOT, "content/products/meta.json"), "utf8"));
    expect([...meta.pages].sort()).toEqual([...productSlugs].sort());
  });

  test.each(products.map((page) => [page.slug, page] as const))("%s", (_slug, page) => {
    checkCommon(page);
    const { call, docs, group, features, related } = page.data;
    expect(typeof call).toBe("string");
    expect({ docs, resolves: docsPageExists(String(docs)) }).toEqual({ docs, resolves: true });
    expect(PRODUCT_GROUPS).toContain(group as (typeof PRODUCT_GROUPS)[number]);
    expect((features as unknown[]).length).toBeGreaterThanOrEqual(3);
    for (const other of (related ?? []) as string[]) {
      expect({ related: other, exists: productSlugs.has(other) }).toEqual({
        related: other,
        exists: true,
      });
    }
    expect(checkFaq(page).length).toBeGreaterThanOrEqual(4);
  });
});

describe("solution pages", () => {
  test("every page is listed in meta.json, and every listed page exists", () => {
    const meta = JSON.parse(readFileSync(path.join(ROOT, "content/solutions/meta.json"), "utf8"));
    expect([...meta.pages].sort()).toEqual([...solutionSlugs].sort());
  });

  test.each(solutions.map((page) => [page.slug, page] as const))("%s", (_slug, page) => {
    checkCommon(page);
    for (const product of page.data.products as string[]) {
      expect({ product, exists: productSlugs.has(product) }).toEqual({ product, exists: true });
    }
    checkFaq(page);
  });
});

describe("comparisons", () => {
  test("slugs are unique", () => {
    expect(competitorSlugs.size).toBe(COMPETITORS.length);
  });

  test.each(COMPETITORS.map((c) => [c.slug, c] as const))("%s", (_slug, c) => {
    expect(c.verdict.length).toBeLessThanOrEqual(160);
    expect(PRICE.test(c.verdict)).toBe(false);
    expect(c.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.rows.length).toBeGreaterThanOrEqual(6);
    expect(c.chooseThem.length).toBeGreaterThan(0);
    expect(c.chooseCoss.length).toBeGreaterThan(0);
    expect(c.faq.length).toBeGreaterThanOrEqual(3);
    expect(c.sources.length).toBeGreaterThanOrEqual(2);
    for (const source of c.sources) expect(source.href).toStartWith("https://");
    for (const product of c.products) {
      expect({ product, exists: productSlugs.has(product) }).toEqual({ product, exists: true });
    }
    for (const step of c.migration) {
      if (step.href)
        expect({ href: step.href, resolves: resolves(step.href) }).toEqual({
          href: step.href,
          resolves: true,
        });
    }
  });
});

describe("pricing sections", () => {
  test("every one says how it bills and prices what it names, in a row that fills the tray", () => {
    const priced = ["products", "solutions"].flatMap((dir) =>
      pages(dir).flatMap(({ slug, body }) => {
        const pricing = pagePricing(body);
        return pricing ? [{ name: `${dir}/${slug}`, pricing, markdown: body }] : [];
      }),
    );
    expect(priced.length).toBeGreaterThan(10);
    for (const { name, pricing, markdown } of priced) {
      const named = markdown.match(/<UsageRates meters="([^"]+)"/)?.[1]?.split(",");
      const cells = pricing.tables.length + (pricing.included.length ? 1 : 0);
      expect({
        name,
        lede: Boolean(pricing.lede),
        meters: named ? pricing.tables.map((table): string => table.meter) : named,
        fits: cells >= 2 && cells <= 4,
      }).toEqual({ name, lede: true, meters: named, fits: true });
    }
  });

  test("a page without a section has none", () => {
    expect(pagePricing('<Section title="Specifications">x</Section>')).toBeNull();
  });
});

describe("navigation", () => {
  test("every footer and menu link on this site resolves", () => {
    const hrefs = [
      ...FOOTER_COLUMNS.flatMap((column) => column.links.map(([, href]) => href)),
      ...ALL_PRODUCT_LINKS.map((link) => link.href),
      ...PLATFORM_LINKS.map((link) => link.href),
    ].filter(
      (href) =>
        !href.startsWith("http") &&
        !["/kloq", "/shipyard", "/ui", "/origin", "/qnot"].some((zone) => href.startsWith(zone)),
    );
    for (const href of hrefs) {
      expect({ href, resolves: resolves(href) }).toEqual({ href, resolves: true });
    }
  });

  test("every product page is in the header's menus", () => {
    const menus = new Set([
      ...ALL_PRODUCT_LINKS.map((link) => link.href),
      ...PLATFORM_LINKS.map((link) => link.href),
      ...DEVELOPER_COLUMNS.flatMap((column) => column.links.map((link) => link.href)),
    ]);
    for (const slug of productSlugs) {
      expect({ slug, linked: menus.has(`/products/${slug}`) }).toEqual({ slug, linked: true });
    }
  });

  test("every product in the menu has its own tile", () => {
    for (const { slug } of ALL_PRODUCT_LINKS) {
      expect({ slug, tile: slug in PRODUCT_VISUALS }).toEqual({ slug, tile: true });
    }
  });

  test("every product page is in the footer", () => {
    const footer = new Set(
      FOOTER_COLUMNS.flatMap((column) => column.links.map(([, href]) => href)),
    );
    for (const slug of productSlugs) {
      expect({ slug, linked: footer.has(`/products/${slug}`) }).toEqual({ slug, linked: true });
    }
  });

  test("comparisons live under /compare", () => {
    expect(COMPARE_ROUTE).toBe("/compare");
  });
});

describe("the pages as Markdown", () => {
  test("sheet components become headings and lists", () => {
    const markdown = renderSheetComponents(
      [
        '<Section title="How it works" lede="One call.">',
        "",
        "Text.",
        "",
        "<Features>",
        '<Feature title="Threads">',
        "Grouped.",
        "</Feature>",
        "</Features>",
        "",
        "<Specs>",
        '<Spec label="Batch send">100 emails</Spec>',
        "</Specs>",
        "",
        "</Section>",
      ].join("\n"),
    );
    expect(markdown).toContain("## How it works\n\nOne call.");
    expect(markdown).toContain("### Threads");
    expect(markdown).toContain("- Batch send: 100 emails");
    expect(markdown).not.toMatch(/<\/?(Section|Features|Feature|Specs|Spec)\b/);
  });

  test("inline billing components become the catalog's text", () => {
    const text = renderInlineBillingComponents(
      'Included: <Included meter="email.recipients" />. On <PlansWith feature="sso" />. <Limit of="inboxes" plan="pro" /> inboxes, <PlanPrice plan="pro" />.',
    );
    expect(text).not.toContain("<");
    expect(text).toContain("Enterprise");
  });

  test("a page's hero sample stays out of its Markdown twin", () => {
    const twin = renderSheetComponents(
      '<HeroSample>\n\n```ts\nshort();\n```\n\n</HeroSample>\n\n<Section title="How it works">\n\n```ts\nfull();\n```\n\n</Section>',
    );
    expect(twin).not.toContain("short()");
    expect(twin).toContain("full()");
  });

  test("every product and solution page has a hero sample and a showcase", () => {
    for (const page of [...products, ...solutions]) {
      expect({ page: page.slug, sample: page.body.includes("<HeroSample>") }).toEqual({
        page: page.slug,
        sample: true,
      });
    }
    const showcaseDir = (dir: string) =>
      readdirSync(path.join(ROOT, "src/components", dir)).map((name) =>
        name.replace(/\.tsx?$/, ""),
      );
    const showcases = new Set(showcaseDir("products"));
    for (const page of products) expect(showcases.has(page.slug)).toBe(true);
    const solutionShowcases = new Set(showcaseDir("solutions"));
    for (const page of solutions) expect(solutionShowcases.has(page.slug)).toBe(true);
  });

  test("pages use only components the Markdown renderer knows", () => {
    const known =
      /^(HeroSample|Section|Features|Feature|Specs|Spec|UsageRates|PlanTable|AddOns|Rate|PlansWith|Included|Limit|PlanPrice|RetentionPeriod|RetentionTable|RiskReasonTable|RiskRuleFieldTable|RiskThreshold|ApiKeyPermissionsTable|Callout|Cards|Card|Steps|Step|Tabs|Tab)$/;
    for (const page of [...products, ...solutions]) {
      const prose = page.body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
      for (const [, name] of prose.matchAll(/<([A-Z][A-Za-z]*)/g)) {
        expect({ page: page.slug, component: name, known: known.test(name ?? "") }).toEqual({
          page: page.slug,
          component: name,
          known: true,
        });
      }
    }
  });
});

describe("share images", () => {
  // An image named in `openGraph` replaces a segment's own opengraph-image file, and a page that
  // sets `openGraph` drops its parents' image: pageMetadata names the default card unless told the
  // segment has its own.
  test("pages pass ownImage exactly where their segment has an opengraph-image", () => {
    const app = path.join(ROOT, "src/app");
    const pagesUsingMetadata = [...new Bun.Glob("**/page.tsx").scanSync(app)].filter((file) =>
      readFileSync(path.join(app, file), "utf8").includes("pageMetadata("),
    );
    expect(pagesUsingMetadata.length).toBeGreaterThan(5);
    for (const file of pagesUsingMetadata) {
      const dir = path.dirname(path.join(app, file));
      const own = readdirSync(dir).some((name) => name.startsWith("opengraph-image"));
      const passes = readFileSync(path.join(app, file), "utf8").includes("ownImage: true");
      expect({ file, ownImage: passes }).toEqual({ file, ownImage: own });
    }
  });
});

describe("comparison cells on the page", () => {
  const cells = COMPETITORS.flatMap((c) => c.rows.flatMap((row) => [row.coss, row.them]));
  const figures = (text: string): string[] => [...(text.match(/\$?\d[\d,.]*\d|\$?\d/g) ?? [])];

  test("every long cell has a brief, shorter than the cell", () => {
    for (const cell of cells.filter((text) => text.length > BRIEF_ABOVE)) {
      const brief = briefCell(cell);
      expect({ cell, shortened: brief !== cell && brief.length < cell.length }).toEqual({
        cell,
        shortened: true,
      });
    }
  });

  test("a brief's figures all come from its cell", () => {
    for (const cell of cells) {
      for (const figure of figures(briefCell(cell))) {
        expect({ cell, figure, inCell: figures(cell).includes(figure) }).toEqual({
          cell,
          figure,
          inCell: true,
        });
      }
    }
  });

  test("a brief never fills in undefined or shows Markdown", () => {
    for (const cell of cells) {
      expect(briefCell(cell)).not.toContain("undefined");
      expect(briefCell(cell)).not.toContain("`");
    }
  });
});
