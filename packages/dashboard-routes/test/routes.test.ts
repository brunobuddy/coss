import { describe, expect, test } from "bun:test";
import {
  DEVELOPERS,
  environmentHref,
  inUseElsewhereLabel,
  orgLinkHref,
  PRODUCTS,
  parseOrgLink,
  productUseInProject,
  sectionOf,
  visibleProducts,
} from "../src/index.ts";

describe("PRODUCTS", () => {
  test("every page lives under its product's root", () => {
    for (const section of [...PRODUCTS, DEVELOPERS]) {
      for (const page of section.pages) {
        expect(page.path === section.path || page.path.startsWith(`${section.path}/`)).toBe(true);
      }
    }
  });

  test("paths are unique", () => {
    const paths = [...PRODUCTS, DEVELOPERS].flatMap((section) => section.pages.map((p) => p.path));
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("sectionOf", () => {
  test("finds the product or Developers from a path below the environment", () => {
    expect(sectionOf("/email/domains/dom_1")?.name).toBe("Email");
    expect(sectionOf("/developers/logs")?.name).toBe("Developers");
    expect(sectionOf("/products")).toBeUndefined();
    expect(sectionOf("")).toBeUndefined();
  });
});

describe("org links", () => {
  test("round-trip a path with its query", () => {
    const href = orgLinkHref("acme", "/email/domains/dom_1?dns_connect=done");
    const to = new URL(href, "https://coss.com").searchParams.get("to");
    expect(href.startsWith("/acme?to=")).toBe(true);
    expect(parseOrgLink(to)).toBe("/email/domains/dom_1?dns_connect=done");
    expect(
      environmentHref(
        { organization: "acme", project: "web", environment: "production" },
        to ?? "",
      ),
    ).toBe("/acme/web/production/email/domains/dom_1?dns_connect=done");
  });

  test("refuse anything that could leave the environment", () => {
    for (const to of [
      "",
      "email",
      "//evil.com",
      "/../x",
      "/a/./b",
      "/a\\b",
      "https://x",
      "/a?b#c",
      "/a b",
    ]) {
      expect(parseOrgLink(to)).toBeNull();
    }
  });
});

describe("visibleProducts", () => {
  test("shows what is in use or pinned, in catalog order, minus what is hidden", () => {
    expect(visibleProducts(["risk", "email", "sms"], { sms: false, forms: true })).toEqual([
      "email",
      "forms",
      "risk",
    ]);
  });

  test("falls back to Email for a new environment", () => {
    expect(visibleProducts([], {})).toEqual(["email"]);
    expect(visibleProducts([], { email: false })).toEqual([]);
  });
});

describe("productUseInProject", () => {
  const production = {
    slug: "production",
    name: "Production",
    products: ["email", "risk"],
  } as const;
  const development = { slug: "development", name: "Development", products: ["email"] } as const;

  test("names the other environments of a product not in use here", () => {
    expect(productUseInProject([production, development], "development")).toEqual({
      here: ["email"],
      inProject: ["email", "risk"],
      elsewhere: { risk: [production] },
    });
  });

  test("a product in use here isn't elsewhere, even when others use it too", () => {
    const use = productUseInProject([production, development], "production");
    expect(use.here).toEqual(["email", "risk"]);
    expect(use.inProject).toEqual(["email", "risk"]);
    expect(use.elsewhere).toEqual({});
  });

  test("lists several other environments in order", () => {
    const staging = { slug: "staging", name: "Staging", products: ["risk"] } as const;
    const use = productUseInProject([production, staging, development], "development");
    expect(use.elsewhere.risk).toEqual([production, staging]);
  });

  test("labels one environment by name and several by count", () => {
    expect(inUseElsewhereLabel([production])).toBe("In use in Production");
    expect(inUseElsewhereLabel([production, development])).toBe("In use in 2 other environments");
  });
});
