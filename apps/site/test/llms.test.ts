/**
 * What agents read first (src/lib/llms.ts): /llms.txt stays small enough to read whole, and the
 * API operations it no longer lists are all one link away.
 */
import "./docs-on-disk";
import { describe, expect, test } from "bun:test";
import spec from "@coss/api/openapi.json";
import { zoneForPath } from "@coss/auth/slugs";

const { AGENT_BRIEF, apiIndex, llmsIndex, productIndex, productIndexSlugs } = await import(
  "../src/lib/llms"
);
const { markdownUrl, source } = await import("../src/lib/source");

/** `AGENT_PROMPT` sends every agent here first: what it costs is paid on every integration. */
const LLMS_TXT_BUDGET = 20 * 1024;
const BRIEF_BUDGET = 6 * 1024;
/** A product's index is one fetch for one job. Email, the largest, has two products' operations. */
const PRODUCT_INDEX_BUDGET = 32 * 1024;

const index = llmsIndex();
const pages = source.getPages();
const operations = pages.filter((page) => page.type === "openapi");
const guides = pages.filter((page) => page.type !== "openapi");
const size = (text: string) => new TextEncoder().encode(text).length;
const linkTo = (url: string) => `(https://coss.com${markdownUrl(url)})`;

describe("/llms.txt", () => {
  test("stays within its budget", () => {
    expect(size(AGENT_BRIEF)).toBeLessThanOrEqual(BRIEF_BUDGET);
    expect(size(index)).toBeLessThanOrEqual(LLMS_TXT_BUDGET);
  });

  test("links every guide, and no API operation", () => {
    for (const page of guides) {
      expect({ url: page.url, listed: index.includes(linkTo(page.url)) }).toEqual({
        url: page.url,
        listed: true,
      });
    }
    for (const page of operations) expect(index).not.toContain(linkTo(page.url));
  });

  test("says where each product's API operations are", () => {
    for (const slug of productIndexSlugs()) {
      expect(index).toContain(`https://coss.com/docs/${slug}/llms.txt`);
    }
    expect(index).toContain("https://coss.com/docs/api-reference/llms.txt");
  });

  test("the brief names every product", () => {
    const summary = AGENT_BRIEF.split("\n").find((line: string) => line.startsWith("> ")) ?? "";
    for (const product of ["email", "inboxes", "SMS", "Verify", "Sign", "Forms", "Scheduling"]) {
      expect(summary).toContain(product);
    }
    for (const product of ["Hooks", "Risk"]) expect(summary).toContain(product);
  });
});

describe("the API operation indexes", () => {
  test("/docs/api-reference/llms.txt has every operation with its method and path", () => {
    const all = apiIndex();
    const paths = Object.values(spec.paths).flatMap((item) => Object.keys(item));
    expect(operations.length).toBe(paths.length);
    for (const page of operations) expect(all).toContain(linkTo(page.url));
    expect(all).toContain("POST /v1/emails");
  });

  test("are served by this app on coss.com without a load balancer rule of their own", () => {
    for (const slug of ["api-reference", ...productIndexSlugs()]) {
      expect(zoneForPath(`/docs/${slug}/llms.txt`)).toBe("site");
    }
  });

  test("links name pages by their titles", () => {
    // The page tree's names aren't always text: an API operation's carries its method badge.
    const send = "[Send an email](https://coss.com/docs/api-reference/emails/send-email.md)";
    expect(apiIndex()).toContain(`${send}: POST /v1/emails`);
    expect(productIndex("email")).toContain(`${send}: POST /v1/emails`);
    for (const text of [index, apiIndex(), ...productIndexSlugs().map(productIndex)]) {
      expect(text).not.toContain("[object Object]");
    }
  });

  test("every operation is in exactly one product's index", () => {
    const indexes = productIndexSlugs().map((slug: string) => productIndex(slug) ?? "");
    for (const page of operations) {
      const found = indexes.filter((text: string) => text.includes(linkTo(page.url)));
      expect({ url: page.url, indexes: found.length }).toEqual({ url: page.url, indexes: 1 });
    }
  });

  test("the products are the ones the docs have, each within its budget", () => {
    expect(productIndexSlugs()).toEqual([
      "email",
      "inboxes",
      "sms",
      "sign",
      "verify",
      "forms",
      "scheduling",
      "hooks",
      "risk",
      "platform",
    ]);
    for (const slug of productIndexSlugs()) {
      const text = productIndex(slug) ?? "";
      expect({ slug, fits: size(text) <= PRODUCT_INDEX_BUDGET }).toEqual({ slug, fits: true });
      expect(text).toContain("## Guides");
      expect(text).toContain("## API operations");
    }
    expect(productIndex("not-a-product")).toBeUndefined();
  });
});
