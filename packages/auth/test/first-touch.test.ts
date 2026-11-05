import { describe, expect, test } from "bun:test";
import { firstTouchFrom, parseStoredFirstTouch } from "../src/first-touch.ts";

const now = new Date("2026-11-05T12:00:00Z");

describe("firstTouchFrom", () => {
  test("keeps the path and the referrer's host, never the full URLs", () => {
    const touch = firstTouchFrom({
      href: "https://coss.com/compare/resend?token=secret#x",
      referrer: "https://www.google.com/search?q=resend+alternative",
      now,
    });
    expect(touch).toEqual({
      landingPath: "/compare/resend",
      referrerHost: "www.google.com",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      landedAt: "2026-11-05T12:00:00.000Z",
    });
  });

  test("treats an internal or missing referrer as direct", () => {
    for (const referrer of ["https://coss.com/ui", "", "not a url"]) {
      expect(firstTouchFrom({ href: "https://coss.com/", referrer, now }).referrerHost).toBeNull();
    }
  });

  test("reads campaign parameters, with ref as a source, and drops anything odd", () => {
    const utm = firstTouchFrom({
      href: "https://coss.com/?utm_source=hn&utm_medium=social&utm_campaign=launch-1",
      referrer: "",
      now,
    });
    expect([utm.utmSource, utm.utmMedium, utm.utmCampaign]).toEqual(["hn", "social", "launch-1"]);
    expect(
      firstTouchFrom({ href: "https://coss.com/?ref=producthunt", referrer: "", now }).utmSource,
    ).toBe("producthunt");
    expect(
      firstTouchFrom({ href: "https://coss.com/?utm_source=<script>", referrer: "", now })
        .utmSource,
    ).toBeNull();
  });

  test("caps the path's length", () => {
    const href = `https://coss.com/${"a".repeat(500)}`;
    expect(firstTouchFrom({ href, referrer: "", now }).landingPath).toHaveLength(200);
  });
});

describe("parseStoredFirstTouch", () => {
  const stored = (landedAt: string) => JSON.stringify({ landingPath: "/pricing", landedAt });

  test("returns a recent visit", () => {
    expect(parseStoredFirstTouch(stored("2026-10-01T00:00:00Z"), now)?.landingPath).toBe(
      "/pricing",
    );
  });

  test("ignores old, malformed and missing values", () => {
    expect(parseStoredFirstTouch(stored("2026-01-01T00:00:00Z"), now)).toBeNull();
    expect(parseStoredFirstTouch(stored("whenever"), now)).toBeNull();
    expect(parseStoredFirstTouch("{not json", now)).toBeNull();
    expect(parseStoredFirstTouch('{"landedAt":"2026-11-01T00:00:00Z"}', now)).toBeNull();
    expect(parseStoredFirstTouch(null, now)).toBeNull();
  });
});
