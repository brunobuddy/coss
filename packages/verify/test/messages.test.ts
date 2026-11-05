import { describe, expect, test } from "bun:test";
import { verifyEmailContent } from "../src/messages.ts";

describe("verifyEmailContent", () => {
  test("the code is in the body, never the subject or the preview", () => {
    const { subject, text, html } = verifyEmailContent("Acme", "483920", 600, { ownSender: true });
    expect(subject).toBe("Your Acme verification code");
    expect(text).toContain("483920");
    expect(html).toContain("483920");
    const [preview] = html.match(/<div style="display:none[^>]*>[^<]*<\/div>/) ?? [];
    expect(preview).toContain("It expires in 10 minutes.");
    expect(preview).not.toContain("483920");
  });

  test("the app's name is on top only under the customer's own address", () => {
    const own = verifyEmailContent("Acme <b>", "1234", 60, { ownSender: true }).html;
    expect(own).not.toContain("wordmark.png");
    expect(own).toContain("Acme &lt;b&gt;");
    expect(verifyEmailContent("Acme", "1234", 60, { ownSender: false }).html).toContain(
      "wordmark.png",
    );
    // What coss.com's address falls back to when the customer's stops being verified.
    expect(verifyEmailContent("Acme", "1234", 60, { ownSender: true }).cossHtml).toContain(
      "wordmark.png",
    );
  });
});
