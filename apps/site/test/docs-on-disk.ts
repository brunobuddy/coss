/**
 * The site's real sources without Next: the MDX collections only load through its bundler
 * (fumadocs-mdx's macro), so this module reads content/ from disk into the same shape, with
 * Fumadocs' own `structure()` giving the headings and paragraphs search indexes, and lets a test
 * import src/lib/source.ts (real loader, real page tree, real OpenAPI pages) and what uses it.
 * Import it first, and import those modules dynamically after it.
 */
import { mock } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { structure } from "fumadocs-core/mdx-plugins";

const CONTENT = path.resolve(import.meta.dir, "../content");

interface SourceFile {
  type: "page" | "meta";
  path: string;
  data: Record<string, unknown>;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
}

function collection(name: string) {
  const root = path.join(CONTENT, name);
  const files = walk(root).flatMap((file): SourceFile[] => {
    const relative = path.relative(root, file);
    const text = readFileSync(file, "utf8");
    if (file.endsWith(".json")) {
      return [{ type: "meta", path: relative, data: JSON.parse(text) }];
    }
    if (!file.endsWith(".mdx")) return [];
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
    if (!match?.[1]) throw new Error(`${file} has no frontmatter.`);
    const body = match[2] ?? "";
    return [
      {
        type: "page",
        path: relative,
        data: {
          ...(Bun.YAML.parse(match[1]) as Record<string, unknown>),
          structuredData: structure(body),
          getText: async () => body,
        },
      },
    ];
  });
  return { toFumadocsSource: () => ({ files }) };
}

mock.module("server-only", () => ({}));
mock.module("../src/lib/collections", () => ({
  docs: collection("docs"),
  products: collection("products"),
  solutions: collection("solutions"),
}));
