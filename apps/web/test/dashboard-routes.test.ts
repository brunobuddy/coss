import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { DEVELOPERS, ORGANIZATION_SETTINGS, PRODUCTS } from "@coss/dashboard-routes";

const ORG_DIR = path.resolve(import.meta.dir, "../src/app/[orgSlug]");
const ENV_DIR = path.join(ORG_DIR, "[projectSlug]", "[envSlug]");
const SECTIONS = [...PRODUCTS, DEVELOPERS];

function hasPage(dir: string, routePath: string): boolean {
  return existsSync(path.join(dir, ...routePath.split("/").filter(Boolean), "page.tsx"));
}

describe("@coss/dashboard-routes", () => {
  test("every product and Developers page has a route", () => {
    for (const section of SECTIONS) {
      for (const page of [section, ...section.pages]) {
        expect({ path: page.path, exists: hasPage(ENV_DIR, page.path) }).toEqual({
          path: page.path,
          exists: true,
        });
      }
    }
  });

  test("every organization settings page has a route", () => {
    for (const page of ORGANIZATION_SETTINGS) {
      expect({
        path: page.path,
        exists: hasPage(path.join(ORG_DIR, "settings"), page.path),
      }).toEqual({ path: page.path, exists: true });
    }
  });

  test("everything below an environment belongs to a product, Developers or the catalog", () => {
    const roots = new Set([...SECTIONS.map((section) => section.path.slice(1)), "products"]);
    for (const entry of readdirSync(ENV_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      expect({ segment: entry.name, known: roots.has(entry.name) }).toEqual({
        segment: entry.name,
        known: true,
      });
    }
  });
});
