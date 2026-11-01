/**
 * Organization slugs are the first URL segment (`/acme`), so every static top-level route must be
 * a reserved slug, or an organization could shadow it (or be shadowed by it). Under `[orgSlug]`,
 * only the known static segments may exist; project pages sit under the static `projects` segment.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { RESERVED_ORG_SLUGS, zoneForPath } from "@coss/auth/slugs";
import { RESERVED_PROJECT_SLUGS } from "@coss/dashboard-routes";

const APP_DIR = path.resolve(import.meta.dir, "../src/app");

/**
 * Generated metadata routes (`icon.tsx` -> /icon, `robots.ts` -> /robots.txt …). Static metadata
 * files (`favicon.ico`, `icon.png`) keep their extension in the URL, and slugs never contain dots.
 */
const METADATA_ROUTE_FILE =
  /^(icon|apple-icon|opengraph-image|twitter-image|sitemap|robots|manifest)\d*\.[jt]sx?$/;

/**
 * URL segments that `dir` contributes at its level: subdirectories (route groups are transparent)
 * and generated metadata routes. Dynamic `[x]`, private `_x` and parallel `@x` folders are skipped;
 * colocated component files are not routes.
 */
function staticSegments(dir: string): string[] {
  const segments: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const { name } = entry;
    if (entry.isDirectory()) {
      if (name.startsWith("[") || name.startsWith("_") || name.startsWith("@")) continue;
      if (name.startsWith("(") && name.endsWith(")")) {
        segments.push(...staticSegments(path.join(dir, name)));
        continue;
      }
      segments.push(name);
    } else {
      const metadata = METADATA_ROUTE_FILE.exec(name);
      if (metadata?.[1]) segments.push(metadata[1]);
    }
  }
  return segments;
}

describe("route segments vs. organization slugs", () => {
  test("every static top-level segment is a reserved org slug", () => {
    const segments = staticSegments(APP_DIR);
    expect(segments).toContain("sign-in");
    expect(segments).toContain("dashboard");
    for (const segment of segments) {
      expect({ segment, reserved: RESERVED_ORG_SLUGS.has(segment) }).toEqual({
        segment,
        reserved: true,
      });
    }
  });

  test("no dashboard route is served by another zone on coss.com", () => {
    for (const segment of staticSegments(APP_DIR)) {
      expect({ segment, zone: zoneForPath(`/${segment}`) }).toEqual({ segment, zone: "dashboard" });
    }
    // The dashboard has no `/` page: in production that is the site's landing page.
    expect(existsSync(path.join(APP_DIR, "page.tsx"))).toBe(false);
  });

  test("static segments under [orgSlug] are reserved project slugs", () => {
    // `/<org>/<segment>` is also where a project would live, so no project may take its slug.
    const segments = staticSegments(path.join(APP_DIR, "[orgSlug]"));
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect({ segment, reserved: RESERVED_PROJECT_SLUGS.has(segment) }).toEqual({
        segment,
        reserved: true,
      });
    }
  });
});
