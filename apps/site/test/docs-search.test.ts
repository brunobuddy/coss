/**
 * The docs' search through its real index and ranking (src/lib/docs-search.ts): what someone new to
 * a product types, and the page they should land on.
 */
import "./docs-on-disk";
import { describe, expect, test } from "bun:test";
import { searchTokens, stem } from "../src/lib/docs-search-text";

const { docsSearch } = await import("../src/lib/source");

async function pagesFor(query: string): Promise<string[]> {
  const hits = await docsSearch.search(query);
  return hits.filter((hit) => hit.type === "page").map((hit) => hit.url);
}

/** Queries about a product: its page comes first. */
const FIRST: readonly [query: string, page: string][] = [
  ["send a text message", "/docs/sms"],
  ["verify a phone number with a code", "/docs/verify"],
  ["one-time code", "/docs/verify"],
  ["collect signatures on a pdf", "/docs/sign"],
  ["embed signing page", "/docs/sign/embedded-signing"],
  ["e-signature", "/docs/sign"],
  ["hosted form endpoint spam", "/docs/forms"],
  ["file upload form", "/docs/forms/file-uploads"],
  ["connect google calendar", "/docs/scheduling/calendars"],
  ["domain wide delegation", "/docs/scheduling/delegation"],
  ["availability slots", "/docs/scheduling"],
  ["email address for an ai agent", "/docs/inboxes"],
  ["block disposable email signups", "/docs/risk"],
  ["send webhooks to my customers", "/docs/hooks"],
  ["endpoint portal", "/docs/hooks/portal"],
  ["verify webhook signature", "/docs/sdk/webhooks"],
  ["unsubscribe header", "/docs/email/unsubscribe"],
  ["add domain dns", "/docs/email/domains"],
  ["send marketing broadcast", "/docs/email/broadcasts"],
  ["sandbox test key", "/docs/environments"],
];

/** Queries with another good answer ("create a booking" is also /docs/scheduling/bookings). */
const TOP_THREE: readonly [query: string, page: string][] = [
  ["create a booking", "/docs/scheduling"],
  ["reply to thread inbox", "/docs/inboxes/threads"],
  ["rate limit my api", "/docs/risk/rate-limits"],
];

/**
 * Written without looking at the ranking, and SEARCH_KEYWORDS has nothing for them: these say how
 * search does on queries it wasn't tuned for, so don't add keywords to make one pass.
 */
const UNTUNED: readonly [query: string, page: string][] = [
  ["two factor authentication", "/docs/two-factor"],
  ["suppression list", "/docs/email/suppressions"],
  ["dedicated ip", "/docs/email/dedicated-ips"],
  ["smtp relay", "/docs/email/smtp"],
  ["dmarc report", "/docs/email/dmarc"],
  ["import from sendgrid", "/docs/migrate/sendgrid"],
  ["sso saml", "/docs/sso"],
  ["log drain datadog", "/docs/log-drains"],
  ["nodemailer", "/docs/integrations/nodemailer"],
  ["double opt-in", "/docs/forms/double-opt-in"],
  ["sms pumping fraud", "/docs/verify/fraud-guard"],
  ["10dlc registration", "/docs/sms/senders"],
  ["stop keyword opt out", "/docs/sms/receiving"],
  ["signing order reminders", "/docs/sign/email-signing"],
  ["round robin hosts", "/docs/scheduling/pools-and-groups"],
  ["zoom meeting", "/docs/scheduling/zoom"],
  ["retry failed webhook delivery", "/docs/webhooks"],
  ["invoice billing plan", "/docs/billing"],
  ["bimi logo", "/docs/email/bimi"],
  ["api errors", "/docs/api-reference/errors"],
  ["idempotency", "/docs/api-reference/idempotency"],
  ["audit trail sealed pdf", "/docs/sign/completion-and-audit-trail"],
  ["receive inbound email", "/docs/email/receiving"],
  ["open and click tracking", "/docs/email/tracking"],
  ["template variables", "/docs/email/templates"],
  ["contact audience segment", "/docs/email/audiences-and-segments"],
  ["mcp server", "/docs/mcp"],
  ["install the cli", "/docs/cli"],
  ["send sms from python", "/docs/sms/sending"],
  ["cancel a booking", "/docs/scheduling/bookings"],
];

describe("docs search", () => {
  test.each(FIRST)("%s → %s, first", async (query, page) => {
    expect((await pagesFor(query))[0]).toBe(page);
  });

  test.each(TOP_THREE)("%s → %s, in the top three", async (query, page) => {
    expect((await pagesFor(query)).slice(0, 3)).toContain(page);
  });

  test("queries it wasn't tuned for mostly land in the top three", async () => {
    const results = await Promise.all(
      UNTUNED.map(async ([query, page]) => ({
        query,
        page,
        at: (await pagesFor(query)).indexOf(page),
      })),
    );
    const missed = results.filter(({ at }) => at < 0 || at > 2);
    console.log(
      `Untuned queries: ${UNTUNED.length - missed.length}/${UNTUNED.length} in the top 3`,
    );
    expect(missed.length).toBeLessThanOrEqual(2);
  });

  test("API operations are found by what they do, and guides come before them", async () => {
    const pages = await pagesFor("create signature request");
    expect(pages.slice(0, 3)).toContain(
      "/docs/api-reference/signature-requests/create-sign-request",
    );
    expect((await pagesFor("send email")).slice(0, 2)).toEqual([
      "/docs/email",
      "/docs/email/sending",
    ]);
  });

  test("words still match as they are typed, and code by its parts", async () => {
    expect((await pagesFor("webh"))[0]).toBe("/docs/webhooks");
    expect((await pagesFor("mountSigning")).slice(0, 2)).toContain("/docs/sign/embedded-signing");
    expect((await pagesFor("verifyWebhook"))[0]).toBe("/docs/sdk/webhooks");
  });
});

describe("the response", () => {
  const get = async (url: string) => docsSearch.GET(new Request(url));

  test("is Fumadocs' shape: each page, then its passages, on that page's URL", async () => {
    const response = await get(
      "https://coss.com/docs/search.json?query=verify%20webhook%20signature",
    );
    const hits = (await response.json()) as {
      id: string;
      type: string;
      content: string;
      url: string;
      breadcrumbs?: string[];
    }[];
    expect(hits[0]).toEqual({
      id: "/docs/sdk/webhooks",
      type: "page",
      content: expect.any(String),
      breadcrumbs: expect.arrayContaining(["Docs"]),
      url: "/docs/sdk/webhooks",
    });
    expect(new Set(hits.filter((hit) => hit.type !== "page").map((hit) => hit.type))).toEqual(
      new Set(["heading", "text"]),
    );
    let page = "";
    for (const hit of hits) {
      expect(typeof hit.id).toBe("string");
      expect(typeof hit.content).toBe("string");
      if (hit.type === "page") page = hit.url;
      else expect(hit.url.replace(/#.*$/, "")).toBe(page);
    }
    // Ids key the ⌘K menu's list items, so they never repeat.
    expect(new Set(hits.map((hit) => hit.id)).size).toBe(hits.length);
  });

  test("an empty query is an empty list, and `limit` caps the hits", async () => {
    expect(await (await get("https://coss.com/docs/search.json")).json()).toEqual([]);
    const limited = await get("https://coss.com/docs/search.json?query=email&limit=5");
    expect(((await limited.json()) as unknown[]).length).toBe(5);
  });

  test("a query of only stop words finds nothing, and doesn't fail", async () => {
    expect(await docsSearch.search("to the")).toEqual([]);
  });
});

describe("searchTokens", () => {
  test("drops stop words and single letters", () => {
    expect(searchTokens("send a text to my phone")).toEqual(["send", "text", "phon"]);
  });

  test("a hyphenated word counts as its parts and as one word", () => {
    expect(searchTokens("e-signature")).toEqual(["signatur", "esignatur"]);
    expect(searchTokens("sign-ups")).toEqual(["sign", "ups", "signup"]);
    expect(searchTokens("signups")).toEqual(["signup"]);
  });

  test("splits code into its words", () => {
    expect(searchTokens("mountSigning")).toEqual(["mount", "sign", "mountsign"]);
    expect(searchTokens("SendGrid")).toEqual(["send", "grid", "sendgrid"]);
    expect(searchTokens("reply_to coss.sms.send")).toEqual(["reply", "coss", "sms", "send"]);
  });

  test("the forms of a word meet", () => {
    for (const forms of [
      ["signature", "signatures"],
      ["booking", "bookings", "booked", "book"],
      ["schedule", "schedules", "scheduled", "scheduling"],
      ["limit", "limits", "limited", "limiting"],
      ["embed", "embedded", "embedding"],
      ["verify", "verifies", "verified"],
      ["delivery", "deliveries"],
      ["address", "addresses"],
    ]) {
      expect(new Set(forms.map(stem)).size).toBe(1);
    }
    for (const name of ["sms", "dns", "status", "api"]) expect(stem(name)).toBe(name);
  });
});
