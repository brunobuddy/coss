import { describe, expect, test } from "bun:test";
import { renderEmail } from "../src/index.ts";

describe("renderEmail", () => {
  test("escapes customer text in the HTML and keeps subjects on one line", () => {
    const message = renderEmail({
      subject: "Hello <b>Acme</b>\nInc",
      blocks: [
        { paragraph: '<script>alert("x")</script>' },
        { button: { label: "Go", url: "https://coss.test/?a=1&b=2" } },
        {
          steps: [
            { label: "Submitted", state: "done" },
            { label: "Review", detail: "A few days", state: "current" },
            { label: "Sending", state: "upcoming" },
          ],
        },
        { details: [{ label: "Number", value: "+18005550100" }] },
      ],
      reason: "Because.",
    });
    expect(message.subject).toBe("Hello <b>Acme</b> Inc");
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).toContain('href="https://coss.test/?a=1&amp;b=2"');
    expect(message.text).toContain("Go: https://coss.test/?a=1&b=2");
    expect(message.text).toContain("[x] 1. Submitted\n[>] 2. Review (A few days)\n[ ] 3. Sending");
    expect(message.text).toContain("Number: +18005550100");
    expect(message.text).toEndWith("--\nBecause.");
  });

  test("the title and subtitle are escaped and in both parts", () => {
    const message = renderEmail({
      subject: "Subject",
      title: "<i>Title</i>",
      subtitle: "<b>Bailey</b> replied",
      blocks: [{ paragraph: "Hello" }],
    });
    expect(message.html).toContain("&lt;i&gt;Title&lt;/i&gt;");
    expect(message.html).toContain("&lt;b&gt;Bailey&lt;/b&gt; replied");
    expect(message.text).toStartWith("<i>Title</i>\n\n<b>Bailey</b> replied\n\nHello");
  });

  test("the preview is the message, then the subtitle; a long title keeps its size on phones", () => {
    const reply = renderEmail({
      subject: "Subject",
      subtitle: "Bailey replied",
      blocks: [{ paragraph: "Try this first." }],
    }).html;
    expect(reply).toMatch(/<div style="display:none[^>]*>Try this first\.<\/div>/);
    const bare = renderEmail({ subject: "Subject", subtitle: "Bailey replied", blocks: [] }).html;
    expect(bare).toMatch(/<div style="display:none[^>]*>Bailey replied<\/div>/);
    expect(reply).toContain('<h1 class="coss-title"');
    const long = renderEmail({ subject: "A very long subject ".repeat(5), blocks: [] }).html;
    expect(long).not.toContain('<h1 class="coss-title"');
  });

  test("a brand replaces the wordmark and takes no markup", () => {
    const branded = renderEmail({
      subject: "Subject",
      brand: "<b>Acme</b>",
      blocks: [{ paragraph: "Hello" }],
    });
    expect(branded.html).not.toContain("coss.com");
    expect(branded.html).toContain("&lt;b&gt;Acme&lt;/b&gt;");
    expect(renderEmail({ subject: "Subject", blocks: [] }).html).toContain("wordmark.png");
    // A name of only spaces or invisible characters must not leave the email without a sender.
    expect(renderEmail({ subject: "Subject", brand: " \u200b ", blocks: [] }).html).toContain(
      "wordmark.png",
    );
  });

  test("a customer's email drops coss.com's plate and takes their logo and colors", () => {
    const branded = renderEmail({
      subject: "Subject",
      brand: "Acme",
      logo: { src: "cid:logo@acme", width: 800, height: 200 },
      accent: { background: "#2563eb", foreground: "#ffffff" },
      blocks: [{ button: { label: "Go", url: "https://example.com" } }],
    }).html;
    expect(branded).not.toContain('class="coss-plate"');
    expect(branded).not.toContain("radial-gradient");
    expect(branded).toContain('src="cid:logo@acme"');
    expect(branded).toContain('alt="Acme"');
    // Scaled to fit, keeping its shape.
    expect(branded).toContain('width="192" height="48"');
    expect(branded).toContain('bgcolor="#2563eb"');
    expect(branded).not.toContain("https://coss.com");
  });

  test("a logo and accent never reach coss.com's own emails", () => {
    const html = renderEmail({
      subject: "Subject",
      logo: { src: "cid:logo@acme", width: 100, height: 100 },
      accent: { background: "#2563eb", foreground: "#ffffff" },
      blocks: [{ button: { label: "Go", url: "https://example.com" } }],
    }).html;
    expect(html).toContain("wordmark.png");
    expect(html).not.toContain("cid:logo@acme");
    expect(html).not.toContain("#2563eb");
  });

  test("a passcode never reaches the preview, and the new blocks are escaped in both parts", () => {
    const message = renderEmail({
      subject: "Your code",
      blocks: [
        { passcode: "483920" },
        { note: "It expires soon." },
        { fields: [{ label: "<i>Name</i>", value: "Ada\n<script>" }] },
        { quote: "<b>Please sign</b>" },
      ],
    });
    const [preview] = message.html.match(/<div style="display:none[^>]*>[^<]*<\/div>/) ?? [];
    expect(preview).not.toContain("483920");
    expect(message.text).toContain("483920");
    expect(message.text).toContain("<i>Name</i>:\nAda\n<script>");
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;b&gt;Please sign&lt;/b&gt;");
  });

  test("it reads without the extras strict clients strip", () => {
    const { html } = renderEmail({ subject: "Subject", blocks: [{ paragraph: "Hello" }] });
    expect(html).toContain('alt="coss.com"');
    expect(html).toContain('bgcolor="#0c0c0e"');
    // Gmail refuses @font-face: it must not share a <style> with the phone layout.
    const styles = html.match(/<style>[\s\S]*?<\/style>/g) ?? [];
    expect(styles.filter((style) => style.includes("@font-face"))).toHaveLength(1);
    expect(
      styles.filter((style) => style.includes("@font-face") && style.includes("@media")),
    ).toEqual([]);
  });
});
