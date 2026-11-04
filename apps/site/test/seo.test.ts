/**
 * What search engines and answer engines depend on across the site. The pages' collections only
 * load in Next, so content is read from disk and page sources are checked as text.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import robots from "../src/app/robots";
import { PRODUCTS as CATALOG } from "../src/components/home/parts";
import { rateRows } from "../src/lib/billing-text";
import { CHANGELOG, changelogMarkdown, changelogRss } from "../src/lib/changelog";
import { COMPETITORS } from "../src/lib/compare";
import { withoutNestedFolders } from "../src/lib/docs-tree";
import { FOOTER_COLUMNS, PRODUCT_COLUMNS } from "../src/lib/nav";
import { singleOperationProps } from "../src/lib/openapi-single-operation";
import { rateTables } from "../src/lib/pricing";
import { metaDescription } from "../src/lib/seo";
import { markdownResponse, PRODUCTS, SITE_DESCRIPTION } from "../src/lib/site";
import { FREE_TOOLS } from "../src/lib/tools";

const ROOT = path.resolve(import.meta.dir, "..");
const APP = path.join(ROOT, "src/app");

function mdxFiles(dir: string): string[] {
  const root = path.join(ROOT, "content", dir);
  return [...new Bun.Glob("**/*.mdx").scanSync(root)].map((file) => path.join(root, file));
}

function frontmatter(file: string): Record<string, string | undefined> {
  const match = /^---\n([\s\S]*?)\n---/.exec(readFileSync(file, "utf8"));
  if (!match?.[1]) throw new Error(`${file} has no frontmatter.`);
  return Bun.YAML.parse(match[1]) as Record<string, string | undefined>;
}

const relative = (file: string) => path.relative(ROOT, file);

describe("robots", () => {
  const { rules, sitemap } = robots();

  test("nothing a page needs or an answer engine reads is disallowed", () => {
    const disallowed = [rules].flat().flatMap((rule) => rule.disallow ?? []);
    for (const entry of disallowed) {
      expect(entry === "/api/" || String(entry).endsWith("/search.json")).toBe(true);
    }
    expect([rules].flat().map((rule) => rule.allow)).toEqual(["/"]);
  });

  test("lists every zone's sitemap", () => {
    expect(sitemap).toEqual([
      "https://coss.com/sitemap.xml",
      "https://coss.com/ui/sitemap.xml",
      "https://coss.com/origin/sitemap.xml",
      "https://coss.com/qnot/sitemap.xml",
    ]);
  });
});

describe("docs metadata", () => {
  const docs = ["docs", "shipyard", "calendar"].flatMap(mdxFiles);

  test.each(docs.map((file) => [relative(file), file] as const))("%s", (_name, file) => {
    const { description = "", seoTitle } = frontmatter(file);
    expect({ file: relative(file), length: description.length >= 70 }).toEqual({
      file: relative(file),
      length: true,
    });
    expect({ file: relative(file), length: description.length <= 160 }).toEqual({
      file: relative(file),
      length: true,
    });
    if (seoTitle) expect(seoTitle.length).toBeLessThanOrEqual(60);
  });

  test("a section's pages have different titles, or the section can't tell them apart", () => {
    const seen = new Map<string, string>();
    for (const file of mdxFiles("docs")) {
      const { title, seoTitle } = frontmatter(file);
      if (seoTitle) continue;
      const section = path.relative(path.join(ROOT, "content/docs"), file).split(path.sep)[0];
      const key = `${section} ${title}`;
      expect({ key, first: seen.get(key) }).toEqual({ key, first: undefined });
      seen.set(key, file);
    }
  });

  test("every product's section has a landing page", () => {
    const docsRoot = path.join(ROOT, "content/docs");
    const sections = readdirSync(docsRoot, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith("("),
    );
    expect(sections.length).toBeGreaterThan(5);
    for (const { name } of sections) {
      expect({ name, index: existsSync(path.join(docsRoot, name, "index.mdx")) }).toEqual({
        name,
        index: true,
      });
    }
  });
});

describe("metaDescription", () => {
  test("keeps a short description, without Markdown", () => {
    expect(metaDescription("Send `email` with [the SDK](/docs/sdk). **Now**.")).toBe(
      "Send email with the SDK. Now.",
    );
  });

  test("cuts a long one at a sentence, else at a word", () => {
    const first = "A first sentence that runs long enough to be a useful description by itself.";
    const long = `${first} ${"Then a great many more words follow it here. ".repeat(5)}`;
    const cut = metaDescription(long);
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(cut.endsWith(".")).toBe(true);
    expect(cut.startsWith(first)).toBe(true);

    const words = metaDescription("word ".repeat(60));
    expect(words.length).toBeLessThanOrEqual(160);
    expect(words.endsWith("word…")).toBe(true);
  });
});

describe("share images", () => {
  test("a page that sets openGraph names its image, or its segment has its own", () => {
    const pages = [...new Bun.Glob("**/page.tsx").scanSync(APP)];
    for (const file of pages) {
      const text = readFileSync(path.join(APP, file), "utf8");
      if (!/\bopenGraph\s*:/.test(text)) continue;
      expect({ file, names: /images:\s*\[/.test(text) }).toEqual({ file, names: true });
    }
  });
});

describe("Markdown twins", () => {
  test("name the HTML page as canonical", () => {
    const response = markdownResponse("# Page", "/products/email");
    expect(response.headers.get("Link")).toBe('<https://coss.com/products/email>; rel="canonical"');
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
  });

  test("every twin goes through that response", () => {
    const routes = [...new Bun.Glob("**/md/**/route.ts").scanSync(APP)];
    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const file of routes) {
      const text = readFileSync(path.join(APP, file), "utf8");
      expect({ file, canonical: /arkdownResponse\(/.test(text) }).toEqual({
        file,
        canonical: true,
      });
    }
  });
});

describe("what the site says exists", () => {
  test("every product in the catalog has a page", () => {
    for (const product of CATALOG) expect(product.href).toStartWith("/products/");
  });

  test("the site's description fits the default social card, which cuts it at 140 characters", () => {
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(140);
  });

  test("Video isn't sold until it ships", () => {
    const named = [
      SITE_DESCRIPTION,
      ...PRODUCTS.map((product) => product.name),
      ...CATALOG.map((product) => product.name),
      ...PRODUCT_COLUMNS.flatMap((column) => column.links.map((link) => link.label)),
      ...FOOTER_COLUMNS.flatMap((column) => column.links.map(([label]) => label)),
      ...rateRows().map((row) => row.product),
      ...rateTables().map((table) => table.product),
    ];
    for (const name of named) expect(name).not.toMatch(/\bvideo\b/i);
  });
});

describe("links", () => {
  test("the footer lists every comparison", () => {
    const footer = FOOTER_COLUMNS.flatMap((column) => column.links.map(([, href]) => href));
    for (const { slug } of COMPETITORS) {
      expect({ slug, listed: footer.includes(`/compare/${slug}`) }).toEqual({ slug, listed: true });
    }
  });

  test("the header's tree outside the docs leaves API operations to search", () => {
    const tree = withoutNestedFolders({
      type: "root",
      name: "Docs",
      children: [
        {
          type: "folder",
          root: true,
          name: "API reference",
          children: [
            { type: "page", name: "Errors", url: "/docs/api-reference/errors" },
            { type: "folder", name: "Emails", children: [] },
          ],
        },
      ],
    } as Parameters<typeof withoutNestedFolders>[0]);
    const root = tree.children[0] as { children: { type: string }[] };
    expect(root.children.map((child) => child.type)).toEqual(["page"]);
  });
});

describe("singleOperationProps", () => {
  const document = {
    info: { title: "API" },
    paths: {
      "/v1/a": {
        parameters: [{ name: "shared" }],
        get: { operationId: "getA", responses: { $ref: "#/components/responses/One" } },
        post: { operationId: "postA" },
      },
      "/v1/b": { get: { operationId: "getB", schema: { $ref: "#/components/schemas/Other" } } },
    },
    components: {
      responses: { One: { schema: { $ref: "#/components/schemas/Parent" } } },
      schemas: {
        Parent: { items: { $ref: "#/components/schemas/Child" } },
        Child: { parent: { $ref: "#/components/schemas/Parent" } },
        Other: { type: "string" },
      },
      securitySchemes: { bearer: { type: "http" } },
    },
  };

  const { payload } = singleOperationProps({
    operations: [{ path: "/v1/a", method: "get" }],
    payload: { bundled: document },
  });
  const bundled = payload.bundled as typeof document;

  test("keeps only the page's operation, and what its path shares", () => {
    expect(Object.keys(bundled.paths)).toEqual(["/v1/a"]);
    expect(Object.keys(bundled.paths["/v1/a"]).sort()).toEqual(["get", "parameters"]);
    expect(bundled.info).toEqual(document.info);
  });

  test("keeps components as far as references reach, cycles included", () => {
    expect(Object.keys(bundled.components.schemas).sort()).toEqual(["Child", "Parent"]);
    expect(Object.keys(bundled.components.responses)).toEqual(["One"]);
    expect(bundled.components.securitySchemes).toEqual(document.components.securitySchemes);
  });

  test("leaves the document it was given alone", () => {
    expect(Object.keys(document.paths)).toHaveLength(2);
  });
});

describe("free tools", () => {
  test("their pages stay within search result limits", () => {
    for (const { slug, title, description } of FREE_TOOLS) {
      expect({ slug, title: title.length <= 60 }).toEqual({ slug, title: true });
      expect({ slug, description: description.length <= 160 }).toEqual({ slug, description: true });
    }
  });
});

describe("changelog", () => {
  test("is newest first, with no product that isn't live", () => {
    const dates = CHANGELOG.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort().reverse());
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(`${entry.title} ${entry.body} ${entry.href}`).not.toMatch(/\bvideo\b/i);
    }
  });

  test("renders every entry in its feed and Markdown", () => {
    const rss = changelogRss();
    const markdown = changelogMarkdown();
    expect(rss.match(/<item>/g)).toHaveLength(CHANGELOG.length);
    for (const entry of CHANGELOG) expect(markdown).toContain(entry.title);
  });
});
