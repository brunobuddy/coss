import { describe, expect, test } from "bun:test";
import {
  DEVELOPERS,
  environmentHref,
  orgLinkHref,
  PRODUCTS,
  parseOrgLink,
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
