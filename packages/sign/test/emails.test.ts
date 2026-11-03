import { describe, expect, test } from "bun:test";
import { invitationEmail, reminderEmail, signedCopyEmail } from "../src/emails.ts";

const request = {
  requester: "Acme <Inc>",
  title: "Services <agreement>",
  url: "https://sign.test/s?a=1&b=2",
  expiresAt: null,
};

describe("signing emails", () => {
  test("the requester's name is on top only when they send it themselves", () => {
    const own = { ...request, brand: "Acme <Inc>" };
    const emails = [
      invitationEmail({ ...own, message: null }),
      reminderEmail(own),
      signedCopyEmail({ ...own, attached: true }),
    ];
    for (const email of emails) expect(email.html).not.toContain("wordmark.png");
    expect(invitationEmail({ ...request, message: null }).html).toContain("wordmark.png");
    expect(reminderEmail(request).html).toContain("wordmark.png");
  });

  test("a message and every name are text, in both parts", () => {
    const email = invitationEmail({ ...request, message: "<script>hi</script>" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<agreement>");
    expect(email.html).toContain("&lt;script&gt;hi&lt;/script&gt;");
    expect(email.html).toContain('href="https://sign.test/s?a=1&amp;b=2"');
    expect(email.text).toContain("<script>hi</script>");
    expect(email.text).toContain("Review and sign: https://sign.test/s?a=1&b=2");
  });
});
