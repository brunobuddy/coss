import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CossAttribution } from "../src/components/page.tsx";

const branding = { brand_name: "Acme", accent_color: null, logo: null };

describe("CossAttribution", () => {
  test("shows on plans without the white label, as a link that sends no referrer", () => {
    const html = renderToStaticMarkup(
      <CossAttribution branding={{ ...branding, coss_attribution: true }} />,
    );
    expect(html).toContain("Scheduling by coss.com");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("<img");
  });

  test("shows nothing otherwise", () => {
    for (const value of [{ ...branding, coss_attribution: false }, branding, null, undefined]) {
      expect(renderToStaticMarkup(<CossAttribution branding={value} />)).toBe("");
    }
  });
});
