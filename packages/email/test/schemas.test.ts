import { describe, expect, test } from "bun:test";
import {
  CheckSuppressionQuery,
  CreateEmailTemplateRequest,
  CreateSuppressionRequest,
  ListSuppressionsQuery,
  MAX_ATTACHMENTS_BYTES,
  MAX_SCHEDULE_AHEAD_MS,
  parseEmailAddress,
  SendEmailRequest,
  type SendEmailRequestInput,
} from "../src/schemas.ts";

const base: SendEmailRequestInput = {
  from: "Acme <hello@acme.com>",
  to: "user@example.com",
  subject: "Hello",
  text: "Hi there",
};

/** Issues as `path -> message`, for compact assertions. */
function issues(input: unknown): Record<string, string> {
  const result = SendEmailRequest.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

function expectValid(input: unknown) {
  const result = SendEmailRequest.safeParse(input);
  if (!result.success) throw new Error(JSON.stringify(result.error.issues));
  return result.data;
}

const addresses = (count: number, domain = "example.com") =>
  Array.from({ length: count }, (_, i) => `user${i}@${domain}`);

describe("SendEmailRequest: normalization", () => {
  test("fills every key, lists recipients and lower-cases header names", () => {
    expect(
      expectValid({
        ...base,
        to: "  user@example.com ",
        cc: "copy@example.com",
        html: "<p>Hi</p>",
        headers: { "X-Campaign": "fall", "List-Unsubscribe": "<mailto:u@acme.com>" },
        tags: [{ name: "category", value: "welcome" }],
      }),
    ).toEqual({
      from: "Acme <hello@acme.com>",
      to: ["user@example.com"],
      cc: ["copy@example.com"],
      bcc: [],
      reply_to: [],
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi there",
      headers: { "x-campaign": "fall", "list-unsubscribe": "<mailto:u@acme.com>" },
      tags: [{ name: "category", value: "welcome" }],
    });
  });

  test("accepts bare, named and quoted addresses", () => {
    for (const from of [
      "hello@acme.com",
      "Name <a@b.co>",
      "<a@b.co>",
      '"Acme, Inc." <hello@acme.com>',
      '"Say \\"hi\\"" <hello@acme.com>',
      "Zoë Café <hello@acme.com>",
      "first.last+tag@sub.acme.co.uk",
    ]) {
      expect(expectValid({ ...base, from }).from).toBe(from);
    }
  });

  test("an empty body part is dropped when the other one is present", () => {
    expect(expectValid({ ...base, html: "", text: "plain" })).toMatchObject({
      html: null,
      text: "plain",
    });
  });
});

describe("SendEmailRequest: recipients", () => {
  test("rejects 51 recipients in one field", () => {
    expect(issues({ ...base, to: addresses(51) })).toEqual({
      to: "At most 50 addresses are allowed.",
    });
  });

  test("limits unique recipients across to, cc and bcc", () => {
    expect(issues({ ...base, to: addresses(30), cc: addresses(21, "example.org") })).toEqual({
      to: "An email can have at most 50 unique recipients across to, cc and bcc.",
    });
    // Duplicates (case-insensitive, display names ignored) count once.
    expectValid({
      ...base,
      to: addresses(50),
      cc: ["USER0@example.com", "Someone <user1@example.com>"],
      bcc: "user2@example.com",
    });
  });

  test("requires at least one `to` recipient", () => {
    expect(issues({ ...base, to: [] })).toEqual({ to: "Provide at least one recipient." });
    expect(issues({ ...base, to: undefined })).toHaveProperty("to");
    expect(issues({ ...base, to: 42 })).toEqual({
      to: "Expected an email address or an array of email addresses.",
    });
  });

  test("points at the bad address", () => {
    expect(issues({ ...base, to: ["ok@example.com", "nope"] })).toEqual({
      "to.1": 'Must be an email address like "hello@acme.com" or "Acme <hello@acme.com>".',
    });
    expect(Object.keys(issues({ ...base, reply_to: "nope" }))).toEqual(["reply_to"]);
  });

  test("rejects non-ASCII local parts and unencoded IDN domains", () => {
    expect(issues({ ...base, to: "jürgen@example.com" })).toEqual({
      to: "Non-ASCII characters before the @ are not supported.",
    });
    expect(issues({ ...base, to: "user@bücher.de" })).toEqual({
      to: "Internationalized domains must be punycode-encoded (xn--…).",
    });
    expectValid({ ...base, to: "user@xn--bcher-kva.de" });
  });

  test("rejects control characters and unquoted specials in display names", () => {
    for (const from of [
      "Evil\r\nBcc: victim@example.com <hello@acme.com>",
      "Evil\n <hello@acme.com>",
      "Nul\u0000 <hello@acme.com>",
      "Tab\t <hello@acme.com>",
    ]) {
      expect(issues({ ...base, from })).toEqual({
        from: "Must not contain control characters (CR, LF, NUL, …).",
      });
    }
    expect(Object.keys(issues({ ...base, from: "Acme, Inc. <hello@acme.com>" }))).toEqual(["from"]);
    expect(Object.keys(issues({ ...base, from: "a <b> <hello@acme.com>" }))).toEqual(["from"]);
  });
});

describe("SendEmailRequest: content", () => {
  test("requires html or text", () => {
    expect(issues({ from: base.from, to: base.to, subject: "Hi" })).toEqual({
      html: "Provide `html`, `text`, or both.",
    });
    expect(issues({ ...base, text: "", html: "" })).toEqual({
      html: "Provide `html`, `text`, or both.",
    });
  });

  test("validates the subject", () => {
    for (const subject of [
      "Hi\r\nBcc: victim@example.com",
      "Nul\u0000",
      "Del\u007f",
      "Nel\u0085",
    ]) {
      expect(issues({ ...base, subject })).toEqual({
        subject: "Subject must not contain control characters (CR, LF, NUL, …).",
      });
    }
    expectValid({ ...base, subject: "Grüße – 你好 👋" });
    expect(issues({ ...base, subject: "" })).toEqual({ subject: "Subject must not be empty." });
    expect(issues({ ...base, subject: "x".repeat(999) })).toEqual({
      subject: "Subject can be at most 998 characters.",
    });
    expectValid({ ...base, subject: "x".repeat(998) });
  });

  test("rejects unknown fields instead of silently dropping them", () => {
    expect(issues({ ...base, template: "welcome" })).toEqual({
      "": 'Unrecognized key: "template"',
    });
  });
});

describe("SendEmailRequest: templates", () => {
  const { subject: _, text: __, ...addresses } = base;

  test("accepts a template instead of subject and body, keeping template keys for the hash", () => {
    expect(
      expectValid({
        ...addresses,
        template_id: "welcome",
        template_version: 2,
        locale: "pt-br",
        variables: { first_name: "Ada" },
      }),
    ).toMatchObject({
      subject: null,
      html: null,
      text: null,
      template_id: "welcome",
      template_version: 2,
      locale: "pt-BR",
      variables: { first_name: "Ada" },
    });
    expect(expectValid({ ...addresses, template_id: "welcome" }).variables).toEqual({});
    // Sends without a template carry no template keys (request hashes stay as they were).
    expect(Object.keys(expectValid(base))).not.toContain("variables");
  });

  test("refuses content next to a template, and template fields without one", () => {
    expect(issues({ ...base, html: "<p>x</p>", template_id: "welcome" })).toEqual({
      subject: "Not allowed with `template_id`: the template provides it.",
      html: "Not allowed with `template_id`: the template provides it.",
      text: "Not allowed with `template_id`: the template provides it.",
    });
    expect(issues({ ...addresses, text: "x", locale: "en", variables: {} })).toEqual({
      subject: "Provide `subject`, or send a template with `template_id`.",
      locale: "Only allowed with `template_id`.",
      variables: "Only allowed with `template_id`.",
    });
  });

  test("checks locales and the size of variables", () => {
    expect(issues({ ...addresses, template_id: "t", locale: "not a locale" })).toEqual({
      locale: 'Expected a BCP 47 language tag, e.g. "en" or "pt-BR".',
    });
    expect(
      issues({ ...addresses, template_id: "t", variables: { big: "x".repeat(70_000) } }),
    ).toEqual({ variables: "Variables can be at most 64 KB (as JSON)." });
    expect(
      issues({ ...addresses, template_id: "t", variables: JSON.parse('{"__proto__": 1}') }),
    ).toEqual({ "variables.__proto__": "Invalid variable name." });
  });
});

describe("SendEmailRequest: headers", () => {
  test("rejects CR/LF in values and bad names", () => {
    expect(issues({ ...base, headers: { "X-Foo": "a\r\nBcc: victim@example.com" } })).toEqual({
      "headers.X-Foo":
        "Header values must be 1-995 printable ASCII characters without line breaks.",
    });
    expect(Object.keys(issues({ ...base, headers: { "X-Foo": "" } }))).toEqual(["headers.X-Foo"]);
    for (const name of ["X Foo", "X:Foo", "", "Ünicode"]) {
      expect(issues({ ...base, headers: { [name]: "v" } })).toEqual({
        [`headers.${name}`]:
          "Header names must be 1-126 printable ASCII characters without spaces or colons.",
      });
    }
  });

  test("rejects reserved headers in any case, including x-ses-*", () => {
    for (const name of [
      "From",
      "subject",
      "Reply-To",
      "DKIM-Signature",
      "X-SES-Foo",
      "x-ses-tenant",
    ]) {
      expect(issues({ ...base, headers: { [name]: "v" } })).toEqual({
        [`headers.${name}`]: `The "${name}" header is set by coss.com and cannot be overridden.`,
      });
    }
  });

  test("rejects case-insensitive duplicates and more than 15 headers", () => {
    expect(issues({ ...base, headers: { "X-Trace": "1", "x-trace": "2" } })).toEqual({
      "headers.x-trace": 'Duplicate header "x-trace" (header names are case-insensitive).',
    });
    const sixteen = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`X-H${i}`, "v"]));
    expect(issues({ ...base, headers: sixteen })).toEqual({
      headers: "At most 15 custom headers are allowed.",
    });
  });
});

describe("SendEmailRequest: tags", () => {
  test("validates names and values", () => {
    const message = "Must be 1-256 characters: ASCII letters, numbers, underscores or dashes.";
    expect(issues({ ...base, tags: [{ name: "has space", value: "v" }] })).toEqual({
      "tags.0.name": message,
    });
    expect(issues({ ...base, tags: [{ name: "ok", value: "x".repeat(257) }] })).toEqual({
      "tags.0.value": message,
    });
    expect(Object.keys(issues({ ...base, tags: [{ name: "ok" }] }))).toEqual(["tags.0.value"]);
    expect(
      issues({
        ...base,
        tags: [
          { name: "a", value: "1" },
          { name: "a", value: "2" },
        ],
      }),
    ).toEqual({ "tags.1.name": 'Duplicate tag name "a".' });
  });
});

describe("SendEmailRequest: category", () => {
  test("is optional and uses the tag character set", () => {
    expect(expectValid({ ...base, category: "marketing" }).category).toBe("marketing");
    expect(expectValid(base).category).toBeUndefined();
    const message = "Must be 1-256 characters: ASCII letters, numbers, underscores or dashes.";
    for (const category of ["*", "", "has space", "x".repeat(257)]) {
      expect(issues({ ...base, category })).toEqual({ category: message });
    }
  });
});

describe("SendEmailRequest: scheduled_at", () => {
  test("is optional and normalized to UTC", () => {
    expect(Object.hasOwn(expectValid(base), "scheduled_at")).toBe(false);
    const at = new Date(Date.now() + 60 * 60 * 1000);
    at.setUTCMilliseconds(0);
    const withOffset = `${at.toISOString().slice(0, 19)}Z`;
    expect(expectValid({ ...base, scheduled_at: withOffset }).scheduled_at).toBe(at.toISOString());
    // The same instant written in another offset.
    const shifted = new Date(at.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 19);
    expect(expectValid({ ...base, scheduled_at: `${shifted}+02:00` }).scheduled_at).toBe(
      at.toISOString(),
    );
  });

  test("needs an offset and at most 30 days ahead", () => {
    const offsetMessage = "Expected an ISO 8601 date-time with a time zone offset.";
    for (const scheduled_at of ["2026-10-11T09:00:00", "tomorrow", "2026-10-11", ""]) {
      expect(issues({ ...base, scheduled_at })).toEqual({ scheduled_at: offsetMessage });
    }
    const tooFar = new Date(Date.now() + MAX_SCHEDULE_AHEAD_MS + 60_000).toISOString();
    expect(issues({ ...base, scheduled_at: tooFar })).toEqual({
      scheduled_at: "An email can be scheduled at most 30 days ahead.",
    });
    const inTime = new Date(Date.now() + MAX_SCHEDULE_AHEAD_MS - 60_000).toISOString();
    expect(issues({ ...base, scheduled_at: inTime })).toEqual({});
  });
});

describe("SendEmailRequest: attachments", () => {
  const pdf = Buffer.from("%PDF-1.7").toString("base64");

  test("normalizes attachments and infers the content type from the extension", () => {
    const parsed = expectValid({
      ...base,
      attachments: [
        { filename: "Invoice.PDF", content: pdf },
        { filename: "logo.png", content: pdf, content_id: "logo@acme" },
        { filename: "data.bin", content: pdf },
        { filename: "notes.txt", content: pdf, content_type: "Text/Markdown" },
      ],
    });
    expect(parsed.attachments).toEqual([
      { filename: "Invoice.PDF", content: pdf, content_type: "application/pdf", content_id: null },
      { filename: "logo.png", content: pdf, content_type: "image/png", content_id: "logo@acme" },
      {
        filename: "data.bin",
        content: pdf,
        content_type: "application/octet-stream",
        content_id: null,
      },
      { filename: "notes.txt", content: pdf, content_type: "text/markdown", content_id: null },
    ]);
  });

  test.each(["__proto__", "constructor", "unknown"])(
    "uses the fallback content type for .%s",
    (extension) => {
      const parsed = expectValid({
        ...base,
        attachments: [{ filename: `file.${extension}`, content: pdf }],
      });
      expect(parsed.attachments?.[0]?.content_type).toBe("application/octet-stream");
    },
  );

  test("omits the key without attachments", () => {
    expect(Object.hasOwn(expectValid(base), "attachments")).toBe(false);
    expect(Object.hasOwn(expectValid({ ...base, attachments: [] }), "attachments")).toBe(false);
  });

  test("requires canonical, non-empty base64", () => {
    for (const content of [
      "not base64!",
      "QUJD\nREVG",
      "QUJDRA",
      "data:application/pdf;base64,QUJD",
    ]) {
      expect(issues({ ...base, attachments: [{ filename: "a.pdf", content }] })).toEqual({
        "attachments.0.content": "Must be base64-encoded (no whitespace or data: prefix).",
      });
    }
    expect(issues({ ...base, attachments: [{ filename: "a.pdf", content: "" }] })).toEqual({
      "attachments.0.content": "Content must not be empty.",
    });
  });

  test("validates filenames", () => {
    const problem = (filename: string) =>
      issues({ ...base, attachments: [{ filename, content: pdf }] })["attachments.0.filename"];
    expect(problem("../etc/passwd.txt")).toBe("Filenames must not contain / or \\.");
    expect(problem("a\\b.txt")).toBe("Filenames must not contain / or \\.");
    expect(problem("a\r\nb.txt")).toBe(
      "Filenames must not contain control or invisible formatting characters.",
    );
    expect(problem("invoice\u202Efdp.exe")).toBe(
      "Filenames must not contain control or invisible formatting characters.",
    );
    expect(problem("README")).toBe('Filenames need an extension, e.g. "invoice.pdf".');
    expect(problem("trailing.")).toBe('Filenames need an extension, e.g. "invoice.pdf".');
    expect(problem("setup.EXE")).toBe("Attachments with the .exe extension cannot be sent.");
    expect(problem(`${"x".repeat(252)}.pdf`)).toBe("Filenames can be at most 255 characters.");
    expect(problem("Rechnung März.pdf")).toBeUndefined();
  });

  test("validates content types and content ids", () => {
    expect(
      issues({
        ...base,
        attachments: [
          { filename: "a.pdf", content: pdf, content_type: "application/pdf; name=x" },
          { filename: "b.png", content: pdf, content_id: "<logo>" },
          { filename: "c.png", content: pdf, content_id: "logo" },
          { filename: "d.png", content: pdf, content_id: "logo" },
        ],
      }),
    ).toEqual({
      "attachments.0.content_type":
        'Must be a media type like "application/pdf", without parameters.',
      "attachments.1.content_id":
        "Must be 1-100 characters without spaces or angle brackets, e.g. logo@acme.",
      "attachments.3.content_id": 'Duplicate content_id "logo".',
    });
  });

  test("rejects unknown attachment fields", () => {
    expect(
      issues({ ...base, attachments: [{ filename: "a.pdf", content: pdf, path: "https://x" }] }),
    ).toEqual({ "attachments.0": 'Unrecognized key: "path"' });
  });

  test("limits the count and the decoded total size", () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ filename: `${i}.pdf`, content: pdf }));
    expect(issues({ ...base, attachments: many })).toEqual({
      attachments: "At most 20 attachments are allowed.",
    });

    // Exactly at the cap is fine; one more byte is not.
    const half = MAX_ATTACHMENTS_BYTES / 2;
    const chunk = (bytes: number) => Buffer.alloc(bytes, 1).toString("base64");
    expectValid({
      ...base,
      attachments: [
        { filename: "a.pdf", content: chunk(half) },
        { filename: "b.pdf", content: chunk(half) },
      ],
    });
    expect(
      issues({
        ...base,
        attachments: [
          { filename: "a.pdf", content: chunk(half) },
          { filename: "b.pdf", content: chunk(half + 1) },
        ],
      }),
    ).toEqual({ attachments: "Attachments can be at most 25 MB combined (decoded)." });
  });
});

describe("suppression schemas", () => {
  test("CreateSuppressionRequest normalizes the address and defaults the scope to *", () => {
    expect(CreateSuppressionRequest.parse({ address: "Jane <Jane@Example.COM>" })).toEqual({
      address: "jane@example.com",
      scope: "*",
    });
    expect(
      CreateSuppressionRequest.parse({ address: "jane@example.com", scope: "marketing" }),
    ).toEqual({ address: "jane@example.com", scope: "marketing" });
  });

  test("CreateSuppressionRequest rejects bad addresses, scopes and unknown fields", () => {
    expect(CreateSuppressionRequest.safeParse({ address: "nope" }).success).toBe(false);
    expect(
      CreateSuppressionRequest.safeParse({ address: "a@b.co", scope: "news letter" }).success,
    ).toBe(false);
    expect(CreateSuppressionRequest.safeParse({ address: "a@b.co", scope: "**" }).success).toBe(
      false,
    );
    expect(
      CreateSuppressionRequest.safeParse({ address: "a@b.co", reason: "bounce" }).success,
    ).toBe(false);
  });

  test("query schemas coerce the limit and normalize addresses", () => {
    expect(ListSuppressionsQuery.parse({ limit: "10", address: "A@B.co" })).toEqual({
      limit: 10,
      address: "a@b.co",
    });
    expect(ListSuppressionsQuery.safeParse({ limit: "101" }).success).toBe(false);
    expect(CheckSuppressionQuery.parse({ address: "A@B.co", category: "news" })).toEqual({
      address: "a@b.co",
      category: "news",
    });
    expect(CheckSuppressionQuery.safeParse({ address: "a@b.co", category: "*" }).success).toBe(
      false,
    );
  });
});

describe("CreateEmailTemplateRequest", () => {
  function templateIssues(input: unknown): Record<string, string> {
    const result = CreateEmailTemplateRequest.safeParse(input);
    if (result.success) return {};
    return Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
  }

  test("defaults the draft and canonicalizes locales", () => {
    expect(CreateEmailTemplateRequest.parse({ name: " Welcome " })).toEqual({
      name: "Welcome",
      alias: null,
      description: null,
      draft: { default_locale: "en", variables: [], sample_variables: {}, contents: [] },
    });
    const parsed = CreateEmailTemplateRequest.parse({
      name: "Welcome",
      variables: [{ name: "n", type: "number" }],
      contents: [{ locale: "PT-br", subject: "s", text: "t", html: "" }],
    });
    expect(parsed.draft).toMatchObject({
      default_locale: "pt-BR",
      variables: [{ name: "n", type: "number", required: true }],
      contents: [{ locale: "pt-BR", subject: "s", html: null, text: "t" }],
    });
  });

  test("checks variable declarations, aliases and locales", () => {
    expect(
      templateIssues({
        name: "T",
        alias: "Bad Alias",
        default_locale: "fr",
        variables: [
          { name: "items", type: "list" },
          { name: "n", type: "number", default: "1" },
          { name: "n", type: "string", fields: [{ name: "x", type: "string" }] },
          { name: "else", type: "string" },
          { name: "l", type: "list", default: 1, fields: [{ name: "a", type: "string" }] },
          { name: "m", type: "list", fields: [{ name: "__proto__", type: "string" }] },
        ],
        contents: [
          { locale: "en", subject: "s" },
          { locale: "EN", subject: "s", text: "t" },
        ],
      }),
    ).toEqual({
      alias:
        "Aliases are 1-64 lower-case letters, digits, - and _, starting with a letter or digit.",
      "variables.0.fields": "Lists need `fields`.",
      "variables.1.default": "The default must be a number.",
      "variables.2.fields": "Only lists have `fields`.",
      "variables.2.name": 'Duplicate variable "n".',
      "variables.3.name": "This name is reserved by the template language.",
      "variables.4.default": "Lists can't have a default.",
      "variables.5.fields.0.name": "This name is reserved by the template language.",
      "contents.0.html": "Provide `html`, `text`, or both.",
      "contents.1.locale": 'Duplicate locale "en".',
      default_locale: "The default locale needs an entry in `contents`.",
    });
  });
});

describe("parseEmailAddress", () => {
  test("splits Name <address>", () => {
    expect(parseEmailAddress("Acme <hi@acme.com>")).toEqual({
      name: "Acme",
      address: "hi@acme.com",
    });
    expect(parseEmailAddress(" <hi@acme.com> ")).toEqual({ name: null, address: "hi@acme.com" });
    expect(parseEmailAddress("hi@acme.com")).toEqual({ name: null, address: "hi@acme.com" });
    expect(parseEmailAddress("Acme   < hi@acme.com >")).toEqual({
      name: "Acme",
      address: "hi@acme.com",
    });
  });

  test("anything else stays whole, so the address check refuses it", () => {
    for (const value of ["Acme\r\nBcc: x <hi@acme.com>", "<a>b>", "Acme <hi@acme.com> x"]) {
      expect(parseEmailAddress(value)).toEqual({ name: null, address: value });
    }
  });
});
