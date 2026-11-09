/**
 * Every link from the docs, product and solution pages to `/docs/…` lands on a page: a broken one
 * is a 404 for readers and a crawl error in Google Search Console.
 */
import "./docs-on-disk";
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const { source, markdownUrl } = await import("../src/lib/source");

const CONTENT = path.resolve(import.meta.dir, "../content");
const COLLECTIONS = ["docs", "products", "solutions"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
}

const pages = new Set(source.getPages().map((page) => page.url));
const targets = new Set<string>(pages);
for (const url of pages) {
  targets.add(markdownUrl(url));
  // Each section's own llms.txt (src/app/docs/[product]/llms.txt).
  if (url.split("/").length === 3) targets.add(`${url}/llms.txt`);
}

/** Markdown links `](/docs/…)` and JSX `href="/docs/…"`, without their fragment or query. */
const LINK = /(?:\]\(|href=["'{`]+)(\/docs(?:\/[^)\s"'`}#?]*)?)/g;

test("every /docs link in the content points at a page", () => {
  const broken: string[] = [];
  for (const collection of COLLECTIONS) {
    for (const file of walk(path.join(CONTENT, collection))) {
      if (!file.endsWith(".mdx")) continue;
      for (const [, link] of readFileSync(file, "utf8").matchAll(LINK)) {
        const target = link?.replace(/\/$/, "");
        if (target && !targets.has(target)) {
          broken.push(`${path.relative(CONTENT, file)} → ${link}`);
        }
      }
    }
  }
  expect(broken).toEqual([]);
});
