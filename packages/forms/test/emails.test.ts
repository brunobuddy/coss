import { describe, expect, test } from "bun:test";
import { notificationContent, verificationContent } from "../src/emails.ts";

describe("Forms' emails", () => {
  test("a submitter's verification never carries coss.com's name", () => {
    const { html, text, subject } = verificationContent({
      formName: "Wait<list>",
      confirmUrl: "https://forms.test/c?a=1&b=2",
    });
    expect(subject).toBe("Confirm your email for Wait<list>");
    expect(html).not.toContain("wordmark.png");
    expect(html).not.toContain("coss.com");
    expect(text).not.toContain("coss.com");
    expect(html).toContain("Wait&lt;list&gt;");
    expect(html).toContain('href="https://forms.test/c?a=1&amp;b=2"');
  });

  test("a notification shows what was submitted as text, with its labels and files", () => {
    const { html, text } = notificationContent({
      formName: "Contact",
      fields: [{ name: "note", label: "Your note", type: "textarea" }] as never,
      data: { note: "<img src=x onerror=alert(1)>\nSecond line", topics: ["a", "b"] },
      files: [{ filename: "<cv>.pdf", size: 1 }],
      submissionUrl: "https://coss.test/s/1",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("Your note");
    expect(html).toContain("a, b");
    expect(html).toContain("&lt;cv&gt;.pdf");
    expect(text).toContain("Your note:\n<img src=x onerror=alert(1)>\nSecond line");
    expect(text).toContain("View it on coss.com: https://coss.test/s/1");
  });
});
