import { describe, expect, test } from "bun:test";
import { RESERVED_ORG_SLUGS, ZONE_ROUTES } from "@coss/auth/slugs";
import { LEGACY_REDIRECTS } from "../src/lib/legacy-redirects";

describe("legacy redirects", () => {
  test("never shadow an organization: every source is a reserved slug", () => {
    for (const { source } of LEGACY_REDIRECTS) {
      expect(RESERVED_ORG_SLUGS.has(source.slice(1))).toBe(true);
    }
  });

  test("land on the site, so they can't loop through this zone", () => {
    const sitePaths = ZONE_ROUTES.map((route) => route.path);
    for (const { destination } of LEGACY_REDIRECTS) {
      const zone = `/${destination.split("/")[1]}`;
      expect(sitePaths.some((path) => path === zone || path.startsWith(`${zone}/`))).toBe(true);
    }
  });
});
