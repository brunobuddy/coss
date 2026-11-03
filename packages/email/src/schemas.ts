/**
 * Public wire schemas for the email product (snake_case). Plain zod with `.meta({ id })` so the
 * public API, its OpenAPI document and contract tests share one definition. Must not import the
 * database: `@coss/email/schemas` is safe to load anywhere.
 */
import { BILLING_EVENT_TYPES } from "@coss/billing/wire";
import { FORM_WEBHOOK_EVENT_TYPES } from "@coss/forms/schemas";
import { ACCOUNT_EVENT_TYPES } from "@coss/reputation/schemas";
import { RISK_EVENT_TYPES } from "@coss/risk/schemas";
import { SCHEDULING_WEBHOOK_EVENT_TYPES } from "@coss/scheduling/schemas";
import { SIGN_WEBHOOK_EVENT_TYPES } from "@coss/sign/schemas";
import { SMS_WEBHOOK_EVENT_TYPES } from "@coss/sms/schemas";
import { VERIFY_WEBHOOK_EVENT_TYPES } from "@coss/verify/schemas";
import { LATEST_API_VERSION } from "@coss/versioning";
import { HOOK_OPERATIONAL_EVENT_TYPES, TRACEPARENT_PATTERN } from "@coss/webhooks/schemas";
import { z } from "zod";
import { SUBACCOUNT_EVENT_TYPES } from "./subaccount-schemas.ts";
import {
  EmailTemplateReference,
  TemplateLocale,
  TemplateVariableValues,
} from "./template-schemas.ts";

export * from "./template-schemas.ts";

import {
  BROADCAST_EVENT_TYPES,
  CONTACT_EVENT_TYPES,
  INBOX_EVENT_TYPES,
} from "./contact-event-types.ts";

export const MAX_RECIPIENTS = 50;
export const MAX_HEADERS = 15;
export const MAX_TAGS = 50;
export const SUBJECT_MAX_LENGTH = 998;
/** How far ahead `scheduled_at` may be. */
export const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_ATTACHMENTS = 20;
/** Decoded bytes across every attachment of one email (SES caps the whole message at 40 MB). */
export const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024;
/** Emails per `POST /v1/emails/batch` request. */
export const MAX_BATCH_EMAILS = 100;
const FILENAME_MAX_LENGTH = 255;

const ADDRESS_MAX_LENGTH = 254;
const DISPLAY_NAME_MAX_LENGTH = 256;

// C0 (incl. CR, LF, NUL, TAB), DEL and C1 controls: header injection and display spoofing vectors.
const CONTROL_CHARACTERS = /\p{Cc}/u;
// Invisible format characters (bidi overrides, zero-width joiners…) and line/paragraph separators.
const FORMAT_CHARACTERS = /[\p{Cf}\p{Zl}\p{Zp}]/u;
const NON_ASCII = /\P{ASCII}/u;
const NAME_ADDR = /^(.*?)\s*<([^<>]*)>$/;
const QUOTED_NAME = /^"(?:[^"\\]|\\.)*"$/;
// RFC 5322 specials (minus "."): unquoted, they change how the address is parsed downstream.
const UNQUOTED_NAME_SPECIALS = /["<>,;:@()[\]\\]/;
const HEADER_NAME = /^[!-9;-~]{1,126}$/;
const HEADER_VALUE = /^[ -~]{1,995}$/;
// SES limit for one header (name + value), which keeps the folded line within RFC 5322's 998.
const HEADER_LINE_MAX_LENGTH = 996;
const TAG_PART = /^[A-Za-z0-9_-]{1,256}$/;
const CATEGORY = TAG_PART;
// RFC 2045 `type/subtype` tokens, without parameters.
const CONTENT_TYPE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// The `cid:` reference without angle brackets (an RFC 5322 dot-atom-ish msg-id).
const CONTENT_ID = /^[A-Za-z0-9!#$%&'*+\-./=?^_`{|}~@]{1,100}$/;

/** File extensions SES refuses to send (https://docs.aws.amazon.com/ses/latest/dg/attachments.html). */
const BLOCKED_ATTACHMENT_EXTENSIONS: ReadonlySet<string> = new Set(
  (
    "ade adp app asp bas bat cer chm cmd com cpl crt csh der exe fxp gadget hlp hta inf ins isp " +
    "its js jse ksh lib lnk mad maf mag mam maq mar mas mat mau mav maw mda mdb mde mdt mdw mdz " +
    "msc msh msh1 msh2 mshxml msh1xml msh2xml msi msp mst ops pcd pif plg prf prg reg scf scr " +
    "sct shb shs sys ps1 ps1xml ps2 ps2xml psc1 psc2 tmp url vb vbe vbs vps vsmacros vss vst " +
    "vsw vxd ws wsc wsf wsh xnk"
  ).split(" "),
);

/** Content types filled in from the file extension when the caller sends none. */
const CONTENT_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  html: "text/html",
  ics: "text/calendar",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  pdf: "application/pdf",
  png: "image/png",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  svg: "image/svg+xml",
  txt: "text/plain",
  webp: "image/webp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/**
 * Canonical base64: padded, no whitespace or data: URL prefix. A plain scan, because regex
 * engines give up on multi-megabyte strings.
 */
export function isCanonicalBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  for (let i = 0; i < value.length - padding; i++) {
    const c = value.charCodeAt(i);
    const valid =
      (c >= 65 && c <= 90) || // A-Z
      (c >= 97 && c <= 122) || // a-z
      (c >= 48 && c <= 57) || // 0-9
      c === 43 || // +
      c === 47; // /
    if (!valid) return false;
  }
  return true;
}

/** Decoded size of canonical base64, without decoding it. */
export function base64DecodedSize(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

/** The suppression scope that matches every email, whatever its category. */
export const ALL_CATEGORIES = "*";

/**
 * Traffic whose reputation must never mix (`email.stream`): each has its own provider
 * configuration set and tenant, so marketing complaints never pause transactional mail.
 */
export const EMAIL_STREAMS = ["transactional", "marketing"] as const;

/**
 * An environment's content storage: `store` keeps an email's content for the email retention
 * period; `discard` keeps it only until the email is sent, fails or is canceled.
 */
export const CONTENT_STORAGE_MODES = ["store", "discard"] as const;
export type ContentStorageMode = (typeof CONTENT_STORAGE_MODES)[number];
export type EmailStream = (typeof EMAIL_STREAMS)[number];

/**
 * The suppression scope that matches every marketing-stream email: what a complaint about a
 * marketing email adds (a category can't contain `:`, so it never collides with one).
 */
export const MARKETING_STREAM_SCOPE = "stream:marketing";

/** Headers coss.com (or the provider) owns. `x-ses-*` is matched by prefix. */
export const RESERVED_HEADERS: ReadonlySet<string> = new Set([
  "from",
  "to",
  "cc",
  "bcc",
  "reply-to",
  "subject",
  "sender",
  "return-path",
  "date",
  "message-id",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
  "content-disposition",
  "dkim-signature",
  "received",
]);

export function isReservedHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return RESERVED_HEADERS.has(lower) || lower.startsWith("x-ses-");
}

export type ParsedEmailAddress = { name: string | null; address: string };

/**
 * Splits `addr`, `Name <addr>` or `"Name" <addr>` (whitespace-trimmed). Structural only; use
 * `emailAddressProblem` to validate.
 */
export function parseEmailAddress(value: string): ParsedEmailAddress {
  const trimmed = value.trim();
  const match = NAME_ADDR.exec(trimmed);
  if (!match) return { name: null, address: trimmed };
  return { name: match[1] || null, address: match[2]?.trim() ?? "" };
}

const strictEmail = z.email();

/** Why `value` is not an acceptable address, or `null` if it is. */
export function emailAddressProblem(value: string): string | null {
  if (CONTROL_CHARACTERS.test(value)) {
    return "Must not contain control characters (CR, LF, NUL, …).";
  }
  const { name, address } = parseEmailAddress(value);
  if (name !== null) {
    if (name.length > DISPLAY_NAME_MAX_LENGTH) {
      return `Display names can be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`;
    }
    if (FORMAT_CHARACTERS.test(name)) {
      return "Display names must not contain invisible formatting characters.";
    }
    if (!QUOTED_NAME.test(name) && UNQUOTED_NAME_SPECIALS.test(name)) {
      return 'Display names containing " < > , ; : @ ( ) [ ] or \\ must be quoted, e.g. "Acme, Inc." <hello@acme.com>.';
    }
  }
  if (address.length > ADDRESS_MAX_LENGTH) {
    return `Email addresses can be at most ${ADDRESS_MAX_LENGTH} characters.`;
  }
  const at = address.lastIndexOf("@");
  if (at > 0 && NON_ASCII.test(address.slice(0, at))) {
    return "Non-ASCII characters before the @ are not supported.";
  }
  if (at > 0 && NON_ASCII.test(address.slice(at + 1))) {
    return "Internationalized domains must be punycode-encoded (xn--…).";
  }
  if (!strictEmail.safeParse(address).success) {
    return 'Must be an email address like "hello@acme.com" or "Acme <hello@acme.com>".';
  }
  return null;
}

/** Normalized address used to count distinct recipients (bare, lower-cased). */
export function addressKey(value: string): string {
  return parseEmailAddress(value).address.toLowerCase();
}

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (typeof value === "string" ? [value] : value).map((item) => item.trim());
}

const EmailAddress = z
  .string()
  .superRefine((value, ctx) => {
    const problem = emailAddressProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .meta({
    description: 'An email address, optionally with a display name: "Acme <hello@acme.com>".',
  });

/**
 * One address or a list. Kept free of transforms: zod reports the matching branch's precise
 * issues (e.g. `to[2]`) only while those issues are non-aborting.
 */
function addressList(minItems: number) {
  return z.union(
    [
      EmailAddress,
      z
        .array(EmailAddress)
        .min(minItems, "Provide at least one recipient.")
        .max(MAX_RECIPIENTS, `At most ${MAX_RECIPIENTS} addresses are allowed.`),
    ],
    { error: "Expected an email address or an array of email addresses." },
  );
}

const TagPart = z
  .string()
  .regex(TAG_PART, "Must be 1-256 characters: ASCII letters, numbers, underscores or dashes.");

const Tag = z.strictObject({ name: TagPart, value: TagPart });

/** A send's `category` (and a topic's `key`). */
export const Category = z
  .string()
  .regex(CATEGORY, "Must be 1-256 characters: ASCII letters, numbers, underscores or dashes.");

/** Why a file with this name can't be attached to an email; `null` when it can. */
export function attachmentFilenameProblem(value: string): string | null {
  const extension = fileExtension(value);
  if (CONTROL_CHARACTERS.test(value) || FORMAT_CHARACTERS.test(value)) {
    return "Filenames must not contain control or invisible formatting characters.";
  }
  if (value.includes("/") || value.includes("\\")) return "Filenames must not contain / or \\.";
  if (extension === "" || value.endsWith(".")) {
    return 'Filenames need an extension, e.g. "invoice.pdf".';
  }
  if (BLOCKED_ATTACHMENT_EXTENSIONS.has(extension)) {
    return `Attachments with the .${extension} extension cannot be sent.`;
  }
  return null;
}

const Attachment = z
  .strictObject({
    filename: z
      .string()
      .min(1, "Filename must not be empty.")
      .max(FILENAME_MAX_LENGTH, `Filenames can be at most ${FILENAME_MAX_LENGTH} characters.`)
      .superRefine((value, ctx) => {
        const message = attachmentFilenameProblem(value);
        if (message) ctx.addIssue({ code: "custom", message });
      }),
    content: z
      .string()
      .min(1, "Content must not be empty.")
      .refine(isCanonicalBase64, "Must be base64-encoded (no whitespace or data: prefix).")
      .meta({ description: "The file's bytes, base64-encoded." }),
    content_type: z
      .string()
      .regex(CONTENT_TYPE, 'Must be a media type like "application/pdf", without parameters.')
      .optional()
      .meta({ description: "Defaults from the filename's extension." }),
    content_id: z
      .string()
      .regex(
        CONTENT_ID,
        "Must be 1-100 characters without spaces or angle brackets, e.g. logo@acme.",
      )
      .optional()
      .meta({
        description:
          'Makes the attachment inline: reference it from `html` as `<img src="cid:logo@acme">`.',
      }),
  })
  .meta({ id: "SendEmailAttachment" });
export const TrackingOptions = z
  .strictObject({
    opens: z.boolean().optional().meta({
      description: "Add an invisible pixel to the HTML body and record `email.opened` events.",
    }),
    clicks: z
      .boolean()
      .optional()
      .meta({
        description:
          "Send HTML links through a coss.com redirect and record `email.clicked` events. Links with a " +
          "`data-coss-no-track` attribute are left alone.",
      }),
    unsubscribe: z
      .boolean()
      .optional()
      .meta({
        description:
          "Add one-click unsubscribe headers (`List-Unsubscribe` and `List-Unsubscribe-Post`, " +
          "RFC 8058). An unsubscribe suppresses the recipient for this email's category and " +
          "records `email.unsubscribed`. Needs a `category`, a single recipient, no " +
          "`List-Unsubscribe` header of your own and at most 13 custom headers.",
      }),
  })
  .meta({
    id: "TrackingOptions",
    description:
      "Overrides the environment's tracking settings (its default, or the rule for this " +
      "email's category) for this email. Omitted fields keep the configured setting.",
  });

/** Header names whose presence means the customer handles unsubscribes themselves. */
export const LIST_UNSUBSCRIBE_HEADERS = ["list-unsubscribe", "list-unsubscribe-post"] as const;

/**
 * Custom headers an email can have and still get coss.com's two unsubscribe headers: providers take
 * at most `MAX_HEADERS` in all (SES's limit for a simple message).
 */
export const MAX_HEADERS_WITH_UNSUBSCRIBE = MAX_HEADERS - LIST_UNSUBSCRIBE_HEADERS.length;

export type TrackingOptionsOutput = z.output<typeof TrackingOptions>;

const ScheduledAt = z.iso.datetime({
  offset: true,
  error: "Expected an ISO 8601 date-time with a time zone offset.",
});

const TOO_FAR_AHEAD_MESSAGE = "An email can be scheduled at most 30 days ahead.";

function tooFarAhead(scheduledAt: string): boolean {
  return Date.parse(scheduledAt) > Date.now() + MAX_SCHEDULE_AHEAD_MS;
}

/** Rules for an email's subject, sent as is or rendered from a template. */
export const EmailSubject = z
  .string()
  .min(1, "Subject must not be empty.")
  .max(SUBJECT_MAX_LENGTH, `Subject can be at most ${SUBJECT_MAX_LENGTH} characters.`)
  .refine((value) => !CONTROL_CHARACTERS.test(value), {
    message: "Subject must not contain control characters (CR, LF, NUL, …).",
  })
  .refine((value) => !FORMAT_CHARACTERS.test(value), {
    message: "Subject must not contain invisible formatting characters.",
  });

const TEMPLATE_PROVIDED = ["subject", "html", "text"] as const;
const TEMPLATE_ONLY = ["template_version", "locale", "variables"] as const;

/** A sub-account a request names: its id (`sub_…`) or the customer's `uid` for it. */
export const SubaccountRef = z.string().min(1).max(256);

/** The fields of a send request (inboxes pick theirs from it). */
export const SendEmailRequestFields = z.strictObject({
  from: EmailAddress,
  to: addressList(1),
  cc: addressList(0).optional(),
  bcc: addressList(0).optional(),
  reply_to: addressList(0).optional(),
  subject: EmailSubject.optional().meta({
    description: "Required unless the email is sent from a template (`template_id`).",
  }),
  html: z.string().optional().meta({ description: "HTML body. Provide `html`, `text`, or both." }),
  text: z.string().optional().meta({
    description:
      "Plain-text body. Without it, an `html` email goes out with a text part generated from the HTML.",
  }),
  template_id: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .meta({
      description:
        "Send a published email template (its id or alias) instead of `subject`, `html` and " +
        "`text`.",
      examples: ["welcome"],
    }),
  template_version: z.number().int().min(1).optional().meta({
    description: "A published version of the template to send. Defaults to the latest one.",
  }),
  locale: TemplateLocale.optional().meta({
    description:
      'The template locale to send, e.g. "pt-BR". Falls back to the language ("pt"), then ' +
      "to the template's default locale.",
  }),
  variables: TemplateVariableValues.optional().meta({
    description: "Values for the template's variables, keyed by name.",
  }),
  headers: z
    // zod skips `__proto__` keys (prototype-pollution guard), which would silently drop such a
    // header; reject it explicitly while the raw object is still visible.
    .preprocess(
      (raw: Record<string, string>, ctx) => {
        if (raw !== null && typeof raw === "object" && Object.hasOwn(raw, "__proto__")) {
          ctx.addIssue({ code: "custom", path: ["__proto__"], message: "Invalid header name." });
        }
        return raw;
      },
      z.record(z.string(), z.string()).superRefine((headers, ctx) => {
        const entries = Object.entries(headers);
        if (entries.length > MAX_HEADERS) {
          ctx.addIssue({
            code: "custom",
            message: `At most ${MAX_HEADERS} custom headers are allowed.`,
          });
        }
        const seen = new Set<string>();
        for (const [name, value] of entries) {
          const lower = name.toLowerCase();
          if (!HEADER_NAME.test(name)) {
            ctx.addIssue({
              code: "custom",
              path: [name],
              message:
                "Header names must be 1-126 printable ASCII characters without spaces or colons.",
            });
          } else if (isReservedHeader(name)) {
            ctx.addIssue({
              code: "custom",
              path: [name],
              message: `The "${name}" header is set by coss.com and cannot be overridden.`,
            });
          } else if (seen.has(lower)) {
            ctx.addIssue({
              code: "custom",
              path: [name],
              message: `Duplicate header "${name}" (header names are case-insensitive).`,
            });
          }
          seen.add(lower);
          if (!HEADER_VALUE.test(value)) {
            ctx.addIssue({
              code: "custom",
              path: [name],
              message:
                "Header values must be 1-995 printable ASCII characters without line breaks.",
            });
          } else if (name.length + value.length > HEADER_LINE_MAX_LENGTH) {
            ctx.addIssue({
              code: "custom",
              path: [name],
              message: `A header's name and value can be at most ${HEADER_LINE_MAX_LENGTH} characters combined.`,
            });
          }
        }
      }),
    )
    .optional()
    .meta({ description: `Up to ${MAX_HEADERS} custom headers. Names are case-insensitive.` }),
  tags: z
    .array(Tag)
    .max(MAX_TAGS, `At most ${MAX_TAGS} tags are allowed.`)
    .superRefine((tags, ctx) => {
      const seen = new Set<string>();
      for (const [index, tag] of tags.entries()) {
        if (seen.has(tag.name)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "name"],
            message: `Duplicate tag name "${tag.name}".`,
          });
        }
        seen.add(tag.name);
      }
    })
    .optional(),
  category: Category.optional().meta({
    description:
      'What kind of email this is, e.g. "marketing". Recipients suppressed for this category ' +
      "(or for every email) are skipped.",
  }),
  scheduled_at: ScheduledAt.optional().meta({
    description:
      "Send the email at this time instead of now (ISO 8601 with an offset, at most 30 days " +
      "ahead). A time that is not in the future sends immediately. Scheduled emails can be " +
      "rescheduled or canceled until they are sent.",
    example: "2026-10-11T09:00:00Z",
  }),
  attachments: z
    .array(Attachment)
    .max(MAX_ATTACHMENTS, `At most ${MAX_ATTACHMENTS} attachments are allowed.`)
    .superRefine((attachments, ctx) => {
      const seen = new Set<string>();
      let total = 0;
      for (const [index, attachment] of attachments.entries()) {
        // Issues on a single attachment don't abort, so fields may still be invalid here.
        if (typeof attachment.content === "string" && isCanonicalBase64(attachment.content)) {
          total += base64DecodedSize(attachment.content);
        }
        const contentId = attachment.content_id;
        if (contentId === undefined) continue;
        if (seen.has(contentId)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "content_id"],
            message: `Duplicate content_id "${contentId}".`,
          });
        }
        seen.add(contentId);
      }
      if (total > MAX_ATTACHMENTS_BYTES) {
        ctx.addIssue({
          code: "custom",
          message: `Attachments can be at most ${MAX_ATTACHMENTS_BYTES / 1024 / 1024} MB combined (decoded).`,
        });
      }
    })
    .optional()
    .meta({
      description: `Up to ${MAX_ATTACHMENTS} files, at most ${MAX_ATTACHMENTS_BYTES / 1024 / 1024} MB combined.`,
    }),
  tracking: TrackingOptions.optional(),
  stream: z
    .enum(EMAIL_STREAMS)
    .optional()
    .meta({
      description:
        "`transactional` (the default) or `marketing`. Marketing email goes out on its own sending " +
        "infrastructure and reputation, so its complaints never hold up transactional mail. It " +
        "needs the environment's postal address (marketing settings), exactly one recipient, and no " +
        "`List-Unsubscribe` header: coss.com adds one-click unsubscribe headers and a footer with the " +
        "address and an unsubscribe link (place them yourself with `{{{unsubscribe_url}}}`, " +
        "`{{{preferences_url}}}` and `{{{mailing_address}}}`). Contacts who unsubscribed are skipped.",
    }),
  subaccount: SubaccountRef.optional().meta({
    description:
      "Send for one of your sub-accounts (email for platforms): its id (`sub_…`) or your `uid` " +
      "for it. The email then counts toward its quotas and reputation, skips its suppressions " +
      "(and the environment's), and must come from one of its domains or a domain you share " +
      "with sub-accounts. Transactional email only.",
    examples: ["user_8812"],
  }),
});

export const SendEmailRequest = SendEmailRequestFields.superRefine((value, ctx) => {
  // Runs after every field parsed with at most non-aborting issues, so types are as declared.
  const lists = [asList(value.to), asList(value.cc), asList(value.bcc)];
  // A single oversized list already has its own issue.
  const withinFieldLimits = lists.every((list) => list.length <= MAX_RECIPIENTS);
  const unique = new Set(lists.flat().map(addressKey));
  if (withinFieldLimits && unique.size > MAX_RECIPIENTS) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: `An email can have at most ${MAX_RECIPIENTS} unique recipients across to, cc and bcc.`,
    });
  }
  if (value.template_id !== undefined) {
    for (const field of TEMPLATE_PROVIDED) {
      if (value[field] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Not allowed with `template_id`: the template provides it.",
        });
      }
    }
  } else {
    if (value.subject === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["subject"],
        message: "Provide `subject`, or send a template with `template_id`.",
      });
    }
    if (!value.html && !value.text) {
      ctx.addIssue({ code: "custom", path: ["html"], message: "Provide `html`, `text`, or both." });
    }
    for (const field of TEMPLATE_ONLY) {
      if (value[field] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Only allowed with `template_id`.",
        });
      }
    }
  }
  if (value.scheduled_at !== undefined && tooFarAhead(value.scheduled_at)) {
    ctx.addIssue({ code: "custom", path: ["scheduled_at"], message: TOO_FAR_AHEAD_MESSAGE });
  }
  // Marketing email always gets its own unsubscribe headers (the preference center's).
  if (value.tracking?.unsubscribe === true && value.stream !== "marketing") {
    const path = ["tracking", "unsubscribe"];
    if (value.category === undefined) {
      ctx.addIssue({
        code: "custom",
        path,
        message: "One-click unsubscribe needs a `category`: the unsubscribe is scoped to it.",
      });
    }
    if (unique.size > 1) {
      ctx.addIssue({
        code: "custom",
        path,
        message:
          "One-click unsubscribe needs a single recipient across to, cc and bcc: send one " +
          "email per recipient.",
      });
    }
    const headerNames = Object.keys(value.headers ?? {}).map((name) => name.toLowerCase());
    if (LIST_UNSUBSCRIBE_HEADERS.some((name) => headerNames.includes(name))) {
      ctx.addIssue({
        code: "custom",
        path,
        message: "One-click unsubscribe can't be combined with your own List-Unsubscribe headers.",
      });
    }
    if (headerNames.length > MAX_HEADERS_WITH_UNSUBSCRIBE) {
      ctx.addIssue({
        code: "custom",
        path,
        message:
          `One-click unsubscribe adds ${LIST_UNSUBSCRIBE_HEADERS.length} headers: send at most ` +
          `${MAX_HEADERS_WITH_UNSUBSCRIBE} of your own.`,
      });
    }
  }
  if (value.subaccount !== undefined && value.stream === "marketing") {
    ctx.addIssue({
      code: "custom",
      path: ["subaccount"],
      message: "Sub-accounts send transactional email only.",
    });
  }
  if (value.stream === "marketing") {
    // Unsubscribe links are personal: one recipient per marketing email.
    if (withinFieldLimits && unique.size !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "A marketing email has exactly one recipient (across to, cc and bcc).",
      });
    }
    const names = Object.keys(value.headers ?? {});
    for (const name of names) {
      if ((LIST_UNSUBSCRIBE_HEADERS as readonly string[]).includes(name.toLowerCase())) {
        ctx.addIssue({
          code: "custom",
          path: ["headers", name],
          message: "coss.com sets the unsubscribe headers of marketing email itself.",
        });
      }
    }
    if (names.length > MAX_HEADERS_WITH_UNSUBSCRIBE) {
      ctx.addIssue({
        code: "custom",
        path: ["headers"],
        message:
          `Marketing email gets ${LIST_UNSUBSCRIBE_HEADERS.length} unsubscribe headers: send at ` +
          `most ${MAX_HEADERS_WITH_UNSUBSCRIBE} of your own.`,
      });
    }
  }
})
  // Only runs on fully valid input: recipients become arrays, header names lower-case, and every
  // key is present, which also makes the canonical request hash independent of how input was spelled.
  .transform((value) => ({
    from: value.from.trim(),
    to: asList(value.to),
    cc: asList(value.cc),
    bcc: asList(value.bcc),
    reply_to: asList(value.reply_to),
    // `null` for template sends, whose content is rendered at send time.
    subject: value.subject ?? null,
    html: value.html || null,
    text: value.text || null,
    headers: Object.fromEntries(
      Object.entries(value.headers ?? {}).map(([name, headerValue]) => [
        name.toLowerCase(),
        headerValue,
      ]),
    ),
    tags: value.tags ?? [],
    // Absent rather than `null` without a category, so request hashes from before categories
    // existed stay valid for idempotent retries.
    ...(value.category === undefined ? {} : { category: value.category }),
    // Same for `scheduled_at`, normalized to UTC so equivalent offsets hash alike.
    ...(value.scheduled_at === undefined
      ? {}
      : { scheduled_at: new Date(value.scheduled_at).toISOString() }),
    // Absent when there are none, for the same reason.
    ...(value.attachments?.length
      ? {
          attachments: value.attachments.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content,
            content_type:
              attachment.content_type?.toLowerCase() ??
              (Object.hasOwn(CONTENT_TYPES_BY_EXTENSION, fileExtension(attachment.filename))
                ? (CONTENT_TYPES_BY_EXTENSION[fileExtension(attachment.filename)] ??
                  DEFAULT_CONTENT_TYPE)
                : DEFAULT_CONTENT_TYPE),
            content_id: attachment.content_id ?? null,
          })),
        }
      : {}),
    // Absent when not given (transactional), for the same reason.
    ...(value.stream === undefined ? {} : { stream: value.stream }),
    // Absent when not given, for the same reason.
    ...(value.subaccount === undefined ? {} : { subaccount: value.subaccount }),
    // Absent when not given, for the same reason.
    ...(value.tracking === undefined
      ? {}
      : {
          tracking: {
            ...(value.tracking.opens === undefined ? {} : { opens: value.tracking.opens }),
            ...(value.tracking.clicks === undefined ? {} : { clicks: value.tracking.clicks }),
            ...(value.tracking.unsubscribe === undefined
              ? {}
              : { unsubscribe: value.tracking.unsubscribe }),
          },
        }),
    // Only for template sends, for the same reason. The hash covers the request (template and
    // variables), never the rendered content.
    ...(value.template_id === undefined
      ? {}
      : {
          template_id: value.template_id,
          ...(value.template_version === undefined
            ? {}
            : { template_version: value.template_version }),
          ...(value.locale === undefined ? {} : { locale: value.locale }),
          variables: value.variables ?? {},
        }),
  }))
  .meta({
    id: "SendEmailRequest",
    examples: [
      {
        from: "Acme <onboarding@acme.com>",
        to: "user@example.com",
        subject: "Welcome to Acme",
        html: "<p>Thanks for signing up!</p>",
        tags: [{ name: "template", value: "welcome" }],
        category: "onboarding",
      },
      {
        from: "Acme <onboarding@acme.com>",
        to: "user@example.com",
        template_id: "welcome",
        locale: "de",
        variables: { first_name: "Ada" },
      },
    ],
  });

export type SendEmailRequestInput = z.input<typeof SendEmailRequest>;
export type SendEmailRequestOutput = z.output<typeof SendEmailRequest>;

export const SendEmailBatchRequest = z
  .strictObject({
    emails: z
      .array(SendEmailRequest)
      .min(1)
      .max(MAX_BATCH_EMAILS)
      .meta({
        description:
          `Up to ${MAX_BATCH_EMAILS} emails, each accepted by \`POST /v1/emails\`. The batch is ` +
          "accepted or rejected as a whole.",
      }),
  })
  .meta({
    id: "SendEmailBatchRequest",
    examples: [
      {
        emails: [
          {
            from: "Acme <notifications@acme.com>",
            to: "ada@example.com",
            subject: "Your weekly summary",
            html: "<p>Hi Ada, here is your week.</p>",
            category: "digest",
          },
          {
            from: "Acme <notifications@acme.com>",
            to: "grace@example.com",
            subject: "Your weekly summary",
            html: "<p>Hi Grace, here is your week.</p>",
            category: "digest",
          },
        ],
      },
    ],
  });

export type SendEmailBatchRequestInput = z.input<typeof SendEmailBatchRequest>;
export type SendEmailBatchRequestOutput = z.output<typeof SendEmailBatchRequest>;

export const RescheduleEmailRequest = z
  .strictObject({
    scheduled_at: ScheduledAt.meta({
      description:
        "The new time to send the email at (ISO 8601 with an offset, at most 30 days ahead). A " +
        "time that is not in the future sends it right away.",
      example: "2026-10-12T09:00:00Z",
    }),
  })
  .superRefine((value, ctx) => {
    if (tooFarAhead(value.scheduled_at)) {
      ctx.addIssue({ code: "custom", path: ["scheduled_at"], message: TOO_FAR_AHEAD_MESSAGE });
    }
  })
  // Normalized to UTC, like the stored `scheduled_at`.
  .transform((value) => ({ scheduled_at: new Date(value.scheduled_at).toISOString() }))
  .meta({
    id: "RescheduleEmailRequest",
    examples: [{ scheduled_at: "2026-10-12T09:00:00Z" }],
  });

export type RescheduleEmailRequestInput = z.input<typeof RescheduleEmailRequest>;
export type RescheduleEmailRequestOutput = z.output<typeof RescheduleEmailRequest>;

/** Distinct addresses across to, cc and bcc: what send quotas count. */
export function uniqueRecipientCount(params: SendEmailRequestOutput): number {
  return new Set([...params.to, ...params.cc, ...params.bcc].map(addressKey)).size;
}

export const EMAIL_STATUSES = ["queued", "sent", "failed", "scheduled", "canceled"] as const;

/** Ordered by precedence: later delivery events never move a recipient to a lower status. */
export const EMAIL_RECIPIENT_STATUSES = [
  "queued",
  "sent",
  "delivery_delayed",
  "delivered",
  "bounced",
  "suppressed",
  "complained",
  "failed",
  "canceled",
] as const;

export type EmailRecipientStatus = (typeof EMAIL_RECIPIENT_STATUSES)[number];

export const EMAIL_RECIPIENT_TYPES = ["to", "cc", "bcc"] as const;

export const EMAIL_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
  "email.scheduled",
  "email.canceled",
  "email.opened",
  "email.clicked",
  "email.rescheduled",
  "email.unsubscribed",
] as const;

/** Engagement events: recorded by coss.com's tracking endpoints, never change a recipient's status. */
export const ENGAGEMENT_EVENT_TYPES = [
  "email.opened",
  "email.clicked",
] as const satisfies readonly EmailEventType[];

export type EmailEventType = (typeof EMAIL_EVENT_TYPES)[number];

/** Events about received (inbound) emails. Not `email_event` rows: they have their own table. */
export const RECEIVED_EMAIL_EVENT_TYPES = ["email.received"] as const;

export type ReceivedEmailEventType = (typeof RECEIVED_EMAIL_EVENT_TYPES)[number];

/** Events about the organization's domains (delivered to live environments only). */
export const DOMAIN_EVENT_TYPES = ["domain.dmarc_report_received"] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

/**
 * Every type a webhook endpoint can subscribe to: email events, received emails, the
 * organization's domain events (`domain.*`), reputation changes (`account.*`, and each
 * sub-account's `subaccount.*`) and billing events (`billing.*`), all delivered to live
 * environments only, risk reviews (`risk.*`), contact changes (`contact.*`), broadcasts, inbox
 * messages (`inbox.*`), SMS (`sms.*`), signature requests (`sign_request.*`), verifications
 * (`verification.*`), form submissions (`form.submission.*`) and bookings and calendars
 * (`scheduling.*`).
 */
export const WEBHOOK_EVENT_TYPES = [
  ...EMAIL_EVENT_TYPES,
  ...RECEIVED_EMAIL_EVENT_TYPES,
  ...DOMAIN_EVENT_TYPES,
  ...ACCOUNT_EVENT_TYPES,
  ...SUBACCOUNT_EVENT_TYPES,
  ...HOOK_OPERATIONAL_EVENT_TYPES,
  ...BILLING_EVENT_TYPES,
  ...RISK_EVENT_TYPES,
  ...CONTACT_EVENT_TYPES,
  ...BROADCAST_EVENT_TYPES,
  ...INBOX_EVENT_TYPES,
  ...SMS_WEBHOOK_EVENT_TYPES,
  ...SIGN_WEBHOOK_EVENT_TYPES,
  ...VERIFY_WEBHOOK_EVENT_TYPES,
  ...FORM_WEBHOOK_EVENT_TYPES,
  ...SCHEDULING_WEBHOOK_EVENT_TYPES,
] as const;
// Examples shown in the API reference; test/schema-examples.test.ts parses each with its schema.
const EMAIL_ID_EXAMPLE = "email_01k7c8m4q2f3e9v6t5r1n0p8yz";
const RECIPIENT_EXAMPLE = {
  address: "user@example.com",
  type: "to",
  status: "delivered",
  last_event_at: "2026-10-10T12:00:02.000Z",
};
const SENT_EVENT_EXAMPLE = {
  object: "email_event",
  id: "evt_01k7c8m4r0c2b8w9y3d5f6g7h8",
  email_id: EMAIL_ID_EXAMPLE,
  type: "email.sent",
  recipient: null,
  occurred_at: "2026-10-10T12:00:01.000Z",
  data: {},
};
const DELIVERED_EVENT_EXAMPLE = {
  object: "email_event",
  id: "evt_01k7c8m4q2f3e9v6t5r1n0p8yz",
  email_id: EMAIL_ID_EXAMPLE,
  type: "email.delivered",
  recipient: "user@example.com",
  occurred_at: "2026-10-10T12:00:02.000Z",
  data: { delivery: { smtp_response: "250 2.0.0 OK" } },
};

export const EmailRecipient = z
  .object({
    address: z.string().meta({ description: "The bare, lower-cased address." }),
    type: z.enum(EMAIL_RECIPIENT_TYPES),
    status: z.enum(EMAIL_RECIPIENT_STATUSES).meta({
      description:
        "Delivery status of this recipient. `suppressed` means the address is on the " +
        "environment's suppression list (for every email or for this email's category), so it " +
        "was skipped. `canceled` means the scheduled email was canceled before it was sent.",
    }),
    last_event_at: z.iso.datetime().nullable(),
  })
  .meta({ id: "EmailRecipient", examples: [RECIPIENT_EXAMPLE] });

export const SUPPRESSION_REASONS = [
  "bounce",
  "complaint",
  "manual",
  "import",
  "unsubscribe",
] as const;

export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const SuppressionScope = z
  .union([z.literal(ALL_CATEGORIES), z.literal(MARKETING_STREAM_SCOPE), Category], {
    error:
      'Expected "*", "stream:marketing" or a category (ASCII letters, numbers, underscores or ' +
      "dashes).",
  })
  .meta({
    id: "SuppressionScope",
    description:
      "`*` suppresses every email; `stream:marketing` only marketing emails (broadcasts and " +
      "sends with `stream: marketing`; complaints about them add it); a category only emails " +
      "with that category.",
  });

const SuppressionReasonEnum = z.enum(SUPPRESSION_REASONS).meta({
  description:
    "`bounce`: added after a permanent bounce. `complaint`: added after a spam complaint. " +
    "`manual`: added one by one through the API or dashboard. `import`: added by a bulk import. " +
    "`unsubscribe`: added by the recipient's one-click unsubscribe, scoped to the email's category.",
});

export const EmailEventData = z
  .object({
    bounce: z
      .object({
        type: z.enum(["permanent", "transient", "undetermined"]),
        sub_type: z.string(),
        diagnostic_code: z.string().nullable(),
      })
      .optional(),
    complaint: z
      .object({ feedback_type: z.string().nullable(), sub_type: z.string().nullable() })
      .optional(),
    delay: z
      .object({
        type: z.string(),
        expires_at: z.iso.datetime().nullable(),
        diagnostic_code: z.string().nullable(),
      })
      .optional(),
    delivery: z.object({ smtp_response: z.string().nullable() }).optional(),
    failure: z.object({ code: z.string(), message: z.string() }).optional(),
    suppression: z
      .object({ id: z.string(), scope: z.string(), reason: SuppressionReasonEnum })
      .optional()
      .meta({ description: "Only for `email.suppressed`: the entry that matched the recipient." }),
    unsubscribe: z
      .object({
        contact_id: z.string().nullable(),
        topic: z.string().nullable(),
      })
      .optional()
      .meta({
        description:
          "Only for `email.suppressed` without `suppression`: the recipient is a contact who " +
          "unsubscribed (from marketing, or from the email's topic, `topic`).",
      }),
    open: z
      .object({ user_agent: z.string().nullable() })
      .optional()
      .meta({ description: "Only for `email.opened`." }),
    click: z
      .object({
        url: z.string().meta({ description: "The original link that was clicked." }),
        link_position: z
          .number()
          .int()
          .meta({ description: "Index of the link among the email's tracked links." }),
        user_agent: z.string().nullable(),
      })
      .optional()
      .meta({ description: "Only for `email.clicked`." }),
    reschedule: z
      .object({
        scheduled_at: z.iso.datetime().meta({ description: "The new time." }),
        previous_scheduled_at: z.iso.datetime().meta({ description: "The time it replaced." }),
      })
      .optional()
      .meta({ description: "Only for `email.rescheduled`." }),
  })
  .meta({ id: "EmailEventData", examples: [DELIVERED_EVENT_EXAMPLE.data] });

export type EmailEventDataOutput = z.output<typeof EmailEventData>;

export const EmailEvent = z
  .object({
    object: z.literal("email_event"),
    id: z.string().meta({ examples: ["evt_01k7c8m4q2f3e9v6t5r1n0p8yz"] }),
    email_id: z.string(),
    type: z.enum(EMAIL_EVENT_TYPES),
    recipient: z
      .string()
      .nullable()
      .meta({ description: "The recipient this event is about; `null` for the whole email." }),
    occurred_at: z.iso.datetime(),
    data: EmailEventData,
  })
  .meta({ id: "EmailEvent", examples: [DELIVERED_EVENT_EXAMPLE] });

export type EmailEventOutput = z.output<typeof EmailEvent>;

export const EmailEventList = z
  .object({
    object: z.literal("list"),
    data: z.array(EmailEvent),
    has_more: z.boolean(),
  })
  .meta({
    id: "EmailEventList",
    examples: [
      {
        object: "list",
        data: [SENT_EVENT_EXAMPLE, DELIVERED_EVENT_EXAMPLE],
        has_more: false,
      },
    ],
  });

export type EmailEventListOutput = z.output<typeof EmailEventList>;

/**
 * Body of a webhook request. `data` describes the email (never its content, cc or bcc) and
 * carries the event's details (`bounce`, `complaint`, …) like `EmailEvent.data`.
 */
export const EmailWebhookEvent = z
  .object({
    id: z.string().meta({
      description: "The event id: the same as `EmailEvent.id`, and the `webhook-id` header.",
      examples: ["evt_01k7c8m4q2f3e9v6t5r1n0p8yz"],
    }),
    object: z.literal("event"),
    type: z.enum(EMAIL_EVENT_TYPES),
    api_version: z.string().meta({
      description:
        "The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.",
      examples: [LATEST_API_VERSION],
    }),
    created_at: z.iso.datetime(),
    data: EmailEventData.extend({
      email_id: z.string(),
      from: z.string(),
      to: z.array(z.string()),
      subject: z.string(),
      tags: z.array(z.object({ name: z.string(), value: z.string() })),
      category: z.string().nullable(),
      sandbox: z.boolean(),
      recipient: z.string().nullable(),
      occurred_at: z.iso.datetime(),
      subaccount_id: z.string().optional().meta({
        description: "Only for an email sent for a sub-account: its id.",
      }),
      traceparent: z
        .string()
        .regex(TRACEPARENT_PATTERN)
        .optional()
        .meta({
          description:
            "Only for an email sent with a W3C `traceparent` header: that trace context (normalized to version `00`), also sent as this request's `traceparent` header, so handling the event joins the sender's trace.",
          examples: ["00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"],
        }),
    }),
  })
  .meta({
    id: "EmailWebhookEvent",
    examples: [
      {
        id: DELIVERED_EVENT_EXAMPLE.id,
        object: "event",
        type: "email.delivered",
        api_version: LATEST_API_VERSION,
        created_at: "2026-10-10T12:00:03.000Z",
        data: {
          email_id: EMAIL_ID_EXAMPLE,
          from: "Acme <onboarding@acme.com>",
          to: ["user@example.com"],
          subject: "Welcome to Acme",
          tags: [{ name: "template", value: "welcome" }],
          category: "onboarding",
          sandbox: false,
          recipient: "user@example.com",
          occurred_at: DELIVERED_EVENT_EXAMPLE.occurred_at,
          delivery: { smtp_response: "250 2.0.0 OK" },
        },
      },
    ],
  });

export type EmailWebhookEventOutput = z.output<typeof EmailWebhookEvent>;
/** What the outbox stores: delivery adds `api_version` when it renders the event for an endpoint. */
export type StoredEmailWebhookEvent = Omit<EmailWebhookEventOutput, "api_version">;

export const EmailAttachmentObject = z
  .object({
    id: z.string().meta({ example: "att_01k7c8m4q2f3e9v6t5r1n0p8yz" }),
    filename: z.string(),
    content_type: z.string(),
    content_id: z
      .string()
      .nullable()
      .meta({ description: "Set for inline attachments (`cid:` references)." }),
    size: z.number().int().meta({ description: "Size in bytes." }),
  })
  .meta({ id: "EmailAttachment" });

export type EmailAttachmentObjectOutput = z.output<typeof EmailAttachmentObject>;
const TRACKING_EXAMPLE = {
  opens: false,
  clicks: false,
  unsubscribe: false,
  open_count: 0,
  first_opened_at: null,
  last_opened_at: null,
  click_count: 0,
  first_clicked_at: null,
  last_clicked_at: null,
};
const LINK_EXAMPLE = {
  object: "email_link",
  id: "lnk_01k7c8m4q2f3e9v6t5r1n0p8yz",
  email_id: EMAIL_ID_EXAMPLE,
  position: 0,
  url: "https://acme.com/start",
  click_count: 0,
  first_clicked_at: null,
  last_clicked_at: null,
};

export const EmailTracking = z
  .object({
    opens: z.boolean().meta({ description: "Whether opens are tracked for this email." }),
    clicks: z.boolean().meta({ description: "Whether link clicks are tracked for this email." }),
    unsubscribe: z.boolean().meta({
      description: "Whether the email carries one-click unsubscribe headers (RFC 8058).",
    }),
    open_count: z.number().int(),
    first_opened_at: z.iso.datetime().nullable(),
    last_opened_at: z.iso.datetime().nullable(),
    click_count: z.number().int(),
    first_clicked_at: z.iso.datetime().nullable(),
    last_clicked_at: z.iso.datetime().nullable(),
  })
  .meta({
    id: "EmailTracking",
    examples: [TRACKING_EXAMPLE],
    description:
      "Open and click tracking, as resolved when the email was sent, with engagement so far. " +
      "Opens can be inflated by mail clients that prefetch images, clicks by link scanners.",
  });

const CONTENT_STORAGE_EXAMPLE = { mode: "store", discarded_at: null } as const;

export const EmailContentStorage = z
  .object({
    mode: z.enum(CONTENT_STORAGE_MODES).meta({
      description:
        "The environment's content storage when the email was sent. With `discard`, the " +
        "subject, `html`, `text`, `headers`, template variables and attachment filenames are " +
        "cleared once the email is sent, fails or is canceled.",
    }),
    discarded_at: z.iso
      .datetime()
      .nullable()
      .meta({
        description:
          "When the content was cleared; `null` while it is kept. A cleared email has an empty " +
          "`subject`, `html` and `text` `null` and no `headers`.",
      }),
  })
  .meta({
    id: "EmailContentStorage",
    examples: [CONTENT_STORAGE_EXAMPLE],
    description: "Whether coss.com keeps the email's content after sending it.",
  });

export const EmailLink = z
  .object({
    object: z.literal("email_link"),
    id: z.string().meta({ examples: [LINK_EXAMPLE.id] }),
    email_id: z.string(),
    position: z.number().int().meta({ description: "Index of the link among the tracked links." }),
    url: z.string(),
    click_count: z.number().int(),
    first_clicked_at: z.iso.datetime().nullable(),
    last_clicked_at: z.iso.datetime().nullable(),
  })
  .meta({ id: "EmailLink", examples: [LINK_EXAMPLE] });

export type EmailLinkOutput = z.output<typeof EmailLink>;

export const EmailLinkList = z
  .object({
    object: z.literal("list"),
    data: z.array(EmailLink),
    has_more: z.boolean(),
  })
  .meta({
    id: "EmailLinkList",
    examples: [{ object: "list", data: [LINK_EXAMPLE], has_more: false }],
  });

export type EmailLinkListOutput = z.output<typeof EmailLinkList>;

export const EmailFailure = z
  .object({
    code: z.string().meta({
      description:
        "Why the email failed, e.g. `all_recipients_suppressed`, `domain_not_verified`, " +
        "`content_rejected`, `attachments_unavailable`, `dispatch_failed` or `provider_error`.",
      examples: ["all_recipients_suppressed"],
    }),
    message: z.string(),
  })
  .meta({
    id: "EmailFailure",
    examples: [
      {
        code: "all_recipients_suppressed",
        message: "Every recipient is on the suppression list or unsubscribed.",
      },
    ],
  });

export const EmailObject = z
  .object({
    object: z.literal("email"),
    id: z.string().meta({ examples: [EMAIL_ID_EXAMPLE] }),
    from: z.string(),
    to: z.array(z.string()),
    cc: z.array(z.string()),
    bcc: z.array(z.string()),
    reply_to: z.array(z.string()),
    subject: z.string(),
    html: z.string().nullable(),
    text: z.string().nullable(),
    headers: z.record(z.string(), z.string()),
    tags: z.array(z.object({ name: z.string(), value: z.string() })),
    category: z.string().nullable(),
    stream: z.enum(EMAIL_STREAMS),
    status: z.enum(EMAIL_STATUSES).meta({
      description:
        "Whether the email was handed to the delivery provider. `scheduled` emails wait for " +
        "`scheduled_at`; `canceled` ones were canceled before that. Per-recipient delivery is in " +
        "`recipients`.",
    }),
    failure: z.union([EmailFailure, z.null()]).meta({
      description: "Why the email failed; `null` unless `status` is `failed`.",
    }),
    recipients: z.array(EmailRecipient),
    attachments: z.array(EmailAttachmentObject).meta({
      description: "Attachment metadata. Content is never returned, and is discarded once sent.",
    }),
    sandbox: z
      .boolean()
      .meta({ description: "True when sent from a sandbox environment (never delivered)." }),
    tracking: EmailTracking,
    created_at: z.iso.datetime(),
    sent_at: z.iso.datetime().nullable(),
    scheduled_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When the email was scheduled to be sent; `null` if it was not." }),
    batch_id: z
      .string()
      .nullable()
      .meta({ description: "The batch that sent the email; `null` if it was sent on its own." }),
    template: z.union([EmailTemplateReference, z.null()]).meta({
      description: "The template the email was rendered from; `null` if it was sent without one.",
    }),
    broadcast_id: z
      .string()
      .nullable()
      .meta({ description: "The broadcast the email is part of; `null` for any other email." }),
    subaccount_id: z.string().nullable().meta({
      description: "The sub-account the email was sent for; `null` if it was sent for none.",
    }),
    content_storage: EmailContentStorage,
  })
  .meta({
    id: "Email",
    examples: [
      {
        object: "email",
        id: EMAIL_ID_EXAMPLE,
        from: "Acme <onboarding@acme.com>",
        to: ["user@example.com"],
        cc: [],
        bcc: [],
        reply_to: [],
        subject: "Welcome to Acme",
        html: "<p>Thanks for signing up!</p>",
        text: null,
        headers: {},
        tags: [{ name: "template", value: "welcome" }],
        category: "onboarding",
        stream: "transactional",
        status: "sent",
        failure: null,
        recipients: [RECIPIENT_EXAMPLE],
        sandbox: false,
        tracking: TRACKING_EXAMPLE,
        attachments: [],
        created_at: "2026-10-10T12:00:00.000Z",
        sent_at: "2026-10-10T12:00:01.000Z",
        scheduled_at: null,
        batch_id: null,
        template: null,
        broadcast_id: null,
        subaccount_id: null,
        content_storage: CONTENT_STORAGE_EXAMPLE,
      },
    ],
  });

export type EmailObjectOutput = z.output<typeof EmailObject>;

const SUMMARY_EXAMPLE = {
  object: "email",
  id: EMAIL_ID_EXAMPLE,
  from: "Acme <onboarding@acme.com>",
  to: ["user@example.com"],
  cc: [],
  bcc: [],
  reply_to: [],
  subject: "Welcome to Acme",
  tags: [{ name: "template", value: "welcome" }],
  category: "onboarding",
  status: "sent",
  failure: null,
  recipients: [RECIPIENT_EXAMPLE],
  sandbox: false,
  tracking: TRACKING_EXAMPLE,
  created_at: "2026-10-10T12:00:00.000Z",
  sent_at: "2026-10-10T12:00:01.000Z",
  scheduled_at: null,
  batch_id: null,
  template: null,
  subaccount_id: null,
  content_storage: CONTENT_STORAGE_EXAMPLE,
};

/** An email in a list: everything but its content (`html`, `text`, `headers`, `attachments`). */
export const EmailSummary = EmailObject.omit({
  html: true,
  text: true,
  headers: true,
  attachments: true,
}).meta({
  id: "EmailSummary",
  description:
    "An email without its content. Retrieve the email for `html`, `text`, `headers` and " +
    "`attachments`.",
  examples: [SUMMARY_EXAMPLE],
});

export type EmailSummaryOutput = z.output<typeof EmailSummary>;

export const EmailSummaryList = z
  .object({
    object: z.literal("list"),
    data: z.array(EmailSummary),
    has_more: z.boolean(),
  })
  .meta({
    id: "EmailSummaryList",
    examples: [{ object: "list", data: [SUMMARY_EXAMPLE], has_more: false }],
  });

export type EmailSummaryListOutput = z.output<typeof EmailSummaryList>;

export const DEFAULT_EMAIL_LIST_LIMIT = 20;
export const MAX_EMAIL_LIST_LIMIT = 100;

/** A comma-separated list of enum values (`status=failed,canceled`). */
function csvEnum<const T extends readonly [string, ...string[]]>(values: T, description: string) {
  const item = z.enum(values);
  return z
    .string()
    .transform((value, ctx) => {
      const out: T[number][] = [];
      for (const part of value.split(",").map((piece) => piece.trim())) {
        if (part.length === 0) continue;
        const parsed = item.safeParse(part);
        if (!parsed.success) {
          ctx.addIssue({ code: "custom", message: `Invalid value "${part}".` });
          return z.NEVER;
        }
        out.push(parsed.data);
      }
      return out;
    })
    .optional()
    .meta({ description });
}

export const ListEmailsQuery = z
  .strictObject({
    to: z
      .string()
      .trim()
      .min(1)
      .max(320)
      .transform((value) => value.toLowerCase())
      .optional()
      .meta({
        description:
          "Only emails with this recipient (in `to`, `cc` or `bcc`; the bare address, any case).",
        examples: ["user@example.com"],
      }),
    recipient_status: csvEnum(
      EMAIL_RECIPIENT_STATUSES,
      "Only emails with a recipient in one of these statuses, comma-separated: " +
        "`bounced,complained`. With `to`, that recipient's status.",
    ),
    status: csvEnum(EMAIL_STATUSES, "Only emails in these statuses, comma-separated: `failed`."),
    q: z
      .string()
      .max(256)
      .optional()
      .meta({ description: "Free text, matched against the subject and the `to` addresses." }),
    category: Category.optional().meta({ description: "Only emails of this category." }),
    batch_id: z.string().max(64).optional().meta({ description: "Only the emails of this batch." }),
    subaccount: SubaccountRef.optional().meta({
      description: "Only the emails sent for this sub-account (its id or your uid).",
    }),
    created_after: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({ description: "Only emails created at or after this time." }),
    created_before: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({ description: "Only emails created before this time." }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_EMAIL_LIST_LIMIT)
      .optional()
      .meta({ description: `1-${MAX_EMAIL_LIST_LIMIT}, default ${DEFAULT_EMAIL_LIST_LIMIT}.` }),
    after: z
      .string()
      .max(64)
      .optional()
      .meta({ description: "Cursor: the `id` of the last email of the previous page." }),
  })
  .meta({ description: "Emails are returned newest first." });

export type ListEmailsQueryOutput = z.output<typeof ListEmailsQuery>;

const BATCH_EXAMPLE_ID = "batch_01k8d0n6x5f3w2e1r9t7y4u6i8";

export const EmailBatchObject = z
  .object({
    object: z.literal("email_batch"),
    id: z.string().meta({ examples: [BATCH_EXAMPLE_ID] }),
    data: z
      .array(EmailObject)
      .meta({ description: "The batch's emails, in the order of the request." }),
    created_at: z.iso.datetime(),
  })
  .meta({
    id: "EmailBatch",
    examples: [
      {
        object: "email_batch",
        id: BATCH_EXAMPLE_ID,
        data: [
          {
            object: "email",
            id: EMAIL_ID_EXAMPLE,
            from: "Acme <notifications@acme.com>",
            to: ["ada@example.com"],
            cc: [],
            bcc: [],
            reply_to: [],
            subject: "Your weekly summary",
            html: "<p>Hi Ada, here is your week.</p>",
            text: null,
            headers: {},
            tags: [],
            category: "digest",
            stream: "transactional",
            status: "queued",
            failure: null,
            recipients: [
              { address: "ada@example.com", type: "to", status: "queued", last_event_at: null },
            ],
            sandbox: false,
            tracking: TRACKING_EXAMPLE,
            attachments: [],
            created_at: "2026-10-10T12:00:00.000Z",
            sent_at: null,
            scheduled_at: null,
            batch_id: BATCH_EXAMPLE_ID,
            template: null,
            broadcast_id: null,
            subaccount_id: null,
            content_storage: CONTENT_STORAGE_EXAMPLE,
          },
        ],
        created_at: "2026-10-10T12:00:00.000Z",
      },
    ],
  });

export type EmailBatchObjectOutput = z.output<typeof EmailBatchObject>;

export const DOMAIN_STATUSES = [
  "pending",
  "verified",
  "temporary_failure",
  "failed",
  "deleting",
] as const;

export const MAIL_FROM_STATUSES = ["pending", "success", "temporary_failure", "failed"] as const;

export const DOMAIN_RECORD_PURPOSES = ["dkim", "mail_from_mx", "mail_from_spf", "dmarc"] as const;

export const DOMAIN_RECORD_STATUSES = ["verified", "missing", "mismatch", "not_checked"] as const;

export const BIMI_STATUSES = ["not_checked", "missing", "invalid", "configured"] as const;

export const BIMI_ISSUE_CODES = [
  "dmarc_missing",
  "dmarc_not_enforced",
  "dmarc_partial",
  "record_multiple",
  "record_invalid",
  "logo_missing",
  "logo_not_https",
  "certificate_missing",
  "certificate_not_https",
] as const;

export type BimiIssueCode = (typeof BIMI_ISSUE_CODES)[number];

/** What each BIMI issue means, rendered on read (the domain row stores only the codes). */
export const BIMI_ISSUE_MESSAGES: Record<BimiIssueCode, string> = {
  dmarc_missing:
    "The domain (or its organizational domain) has no valid DMARC record, or more than one. BIMI needs DMARC at p=quarantine or p=reject.",
  dmarc_not_enforced:
    "The DMARC policy of the domain or of its organizational domain is p=none (or sp=none for a subdomain). BIMI needs p=quarantine or p=reject.",
  dmarc_partial:
    "The DMARC policy of the domain (or of its organizational domain) applies to only part of the mail (pct below 100, or t=y). BIMI needs it to apply to all of it.",
  record_multiple:
    "There is more than one v=BIMI1 record, which mailbox providers treat as no record. Keep one.",
  record_invalid:
    "The BIMI record is not valid: it must start with v=BIMI1 and list each tag=value only once.",
  logo_missing: "The BIMI record has no logo (l=). Point it at your SVG logo.",
  logo_not_https: "The logo URL (l=) must be an https:// URL.",
  certificate_missing:
    "The BIMI record has no certificate (a=). Gmail and Apple Mail show logos only with a VMC or CMC.",
  certificate_not_https: "The certificate URL (a=) must be an https:// URL.",
};

export const TRACKING_DOMAIN_STATUSES = [
  "pending",
  "active",
  "temporary_failure",
  "failed",
  "deleting",
] as const;

const DOMAIN_ID_EXAMPLE = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz";
const TRACKING_DOMAIN_EXAMPLE = {
  hostname: "links.acme.com",
  status: "active",
  record: {
    type: "CNAME",
    name: "links.acme.com",
    value: "track.cosslinks.com",
    status: "verified",
    found: [],
  },
  message: null,
  created_at: "2026-01-15T09:45:00.000Z",
  last_checked_at: "2026-01-15T09:52:00.000Z",
  activated_at: "2026-01-15T09:52:00.000Z",
  failed_at: null,
} as const;
const VERIFIED_RECORD = { priority: null, required: true, status: "verified", found: [] } as const;
const DKIM_RECORD_EXAMPLE = {
  ...VERIFIED_RECORD,
  purpose: "dkim",
  type: "CNAME",
  name: "x7f3k2m9qp4ld8sv6hwz1nyc5rbtgj0e._domainkey.acme.com",
  value: "x7f3k2m9qp4ld8sv6hwz1nyc5rbtgj0e.dkim.amazonses.com",
} as const;
const BIMI_EXAMPLE = {
  status: "configured",
  name: "default._bimi.acme.com",
  record: "v=BIMI1; l=https://acme.com/brand/logo.svg; a=https://acme.com/brand/vmc.pem",
  logo_url: "https://acme.com/brand/logo.svg",
  certificate_url: "https://acme.com/brand/vmc.pem",
  dmarc_policy: "reject",
  issues: [],
} as const;
const DOMAIN_EXAMPLE = {
  object: "domain",
  id: DOMAIN_ID_EXAMPLE,
  name: "acme.com",
  status: "verified",
  can_send: true,
  region: "us-east-1",
  mail_from_domain: "send.acme.com",
  mail_from_status: "success",
  records: [
    DKIM_RECORD_EXAMPLE,
    {
      ...VERIFIED_RECORD,
      purpose: "mail_from_mx",
      type: "MX",
      name: "send.acme.com",
      value: "feedback-smtp.us-east-1.amazonses.com",
      priority: 10,
    },
    {
      ...VERIFIED_RECORD,
      purpose: "mail_from_spf",
      type: "TXT",
      name: "send.acme.com",
      value: "v=spf1 include:amazonses.com ~all",
    },
    {
      ...VERIFIED_RECORD,
      purpose: "dmarc",
      type: "TXT",
      name: "_dmarc.acme.com",
      value: "v=DMARC1; p=none;",
      required: false,
    },
  ],
  created_at: "2026-01-15T09:30:00.000Z",
  last_checked_at: "2026-01-15T09:42:10.000Z",
  verified_at: "2026-01-15T09:42:10.000Z",
  failed_at: null,
  tracking: TRACKING_DOMAIN_EXAMPLE,
  receiving: null,
  bimi: BIMI_EXAMPLE,
  subaccount_id: null,
  shared_with_subaccounts: false,
} as const;

export const DomainRecordObject = z
  .object({
    purpose: z.enum(DOMAIN_RECORD_PURPOSES).meta({
      description:
        "What the record is for: `dkim` signs messages, `mail_from_mx` and `mail_from_spf` " +
        "set up the bounce subdomain, `dmarc` is recommended but not required.",
    }),
    type: z.enum(["CNAME", "MX", "TXT"]),
    name: z.string().meta({ description: "The fully qualified record name to create." }),
    value: z.string(),
    priority: z.number().int().nullable().meta({ description: "`MX` records only." }),
    required: z.boolean().meta({ description: "`false` for records that are only recommended." }),
    status: z.enum(DOMAIN_RECORD_STATUSES).meta({
      description:
        "What the last DNS check saw. `not_checked` means DNS has not been consulted yet.",
    }),
    found: z.array(z.string()).meta({ description: "What DNS returned when it did not match." }),
  })
  .meta({ id: "DomainRecord", examples: [DKIM_RECORD_EXAMPLE] });

export type DomainRecordObjectOutput = z.output<typeof DomainRecordObject>;

export const DomainBimiObject = z
  .object({
    status: z.enum(BIMI_STATUSES).meta({
      description:
        "`configured` when the BIMI record is valid and DMARC is enforced, `invalid` when a " +
        "record exists but something is wrong (see `issues`), `missing` when there is no record, " +
        "and `not_checked` until DNS has been consulted. coss.com checks DNS only: mailbox providers " +
        "still validate the logo and the certificate.",
    }),
    name: z.string().meta({
      description:
        "Where the BIMI record was found, or looked up when there is none: " +
        "`default._bimi.<domain>`, or the organizational domain's when only it has one.",
    }),
    record: z.string().nullable().meta({ description: "The `v=BIMI1` record found." }),
    logo_url: z.string().nullable().meta({ description: "The record's logo URL (`l=`)." }),
    certificate_url: z
      .string()
      .nullable()
      .meta({ description: "The record's VMC or CMC certificate URL (`a=`)." }),
    dmarc_policy: z
      .enum(["none", "quarantine", "reject"])
      .nullable()
      .meta({
        description:
          "The DMARC policy that applies to the domain (the organizational domain's `sp` when it has no record of its own), " +
          "`null` without a DMARC record.",
      }),
    issues: z
      .array(z.object({ code: z.enum(BIMI_ISSUE_CODES), message: z.string() }))
      .meta({ description: "What keeps the domain's logo from showing, as far as DNS tells." }),
  })
  .meta({
    id: "DomainBimi",
    description:
      "The result of the last BIMI check: whether mailbox providers can find the domain's brand " +
      "logo and certificate. The record and the certificate are your own.",
    examples: [BIMI_EXAMPLE],
  });

export type DomainBimiObjectOutput = z.output<typeof DomainBimiObject>;

export const TrackingDomainObject = z
  .object({
    hostname: z.string().meta({
      description: "The tracking hostname, a subdomain of the domain.",
      examples: ["links.acme.com"],
    }),
    status: z.enum(TRACKING_DOMAIN_STATUSES).meta({
      description:
        "`pending` until the CNAME points at coss.com and its certificate is issued, `active` once " +
        "links and open pixels of emails sent from the domain use it, `temporary_failure` when " +
        "an active hostname stopped working (emails fall back to the default tracking host " +
        "meanwhile), `failed` when setup gave up (72 hours) — restart it with the domain's " +
        "verify endpoint. `deleting` is a removal in progress.",
    }),
    record: z
      .object({
        type: z.literal("CNAME"),
        name: z.string().meta({ description: "The fully qualified record name to create." }),
        value: z.string().meta({ description: "The host the record must point at." }),
        status: z.enum(DOMAIN_RECORD_STATUSES).meta({
          description:
            "What the last DNS check saw. `not_checked` means DNS has not been consulted yet.",
        }),
        found: z
          .array(z.string())
          .meta({ description: "What DNS returned when it did not match." }),
      })
      .meta({ description: "The DNS record to publish, with the result of the last check." }),
    message: z.string().nullable().meta({
      description: "What is holding the hostname up, when the certificate provider said.",
    }),
    created_at: z.iso.datetime(),
    last_checked_at: z.iso.datetime().nullable(),
    activated_at: z.iso.datetime().nullable(),
    failed_at: z.iso.datetime().nullable(),
  })
  .meta({
    id: "TrackingDomain",
    description:
      "A domain's custom tracking domain: open pixels and click redirects of emails sent from " +
      "the domain use it while it is `active`.",
    examples: [TRACKING_DOMAIN_EXAMPLE],
  });

export type TrackingDomainObjectOutput = z.output<typeof TrackingDomainObject>;

const RECEIVING_DOMAIN_EXAMPLE = {
  hostname: "inbound.acme.com",
  environment_id: "env_01k7c8m4q2f3e9v6t5r1n0p8yz",
  record: {
    type: "MX",
    name: "inbound.acme.com",
    value: "inbound-smtp.us-east-1.amazonaws.com",
    priority: 10,
    status: "verified",
    found: [],
  },
  created_at: "2026-01-15T09:45:00.000Z",
  last_checked_at: "2026-01-15T09:52:00.000Z",
} as const;

export const ReceivingDomainObject = z
  .object({
    hostname: z.string().meta({
      description: "The hostname that receives email: the domain itself or a subdomain of it.",
      examples: ["inbound.acme.com"],
    }),
    environment_id: z.string().meta({
      description: "The environment its received emails are delivered to.",
      examples: ["env_01k7c8m4q2f3e9v6t5r1n0p8yz"],
    }),
    record: z
      .object({
        type: z.literal("MX"),
        name: z.string().meta({ description: "The fully qualified record name to create." }),
        value: z.string().meta({ description: "The mail exchange the record must point at." }),
        priority: z.number().int(),
        status: z.enum(DOMAIN_RECORD_STATUSES).meta({
          description:
            "What the last DNS check saw: `verified` once the most preferred MX records point " +
            "at coss.com. `not_checked` means DNS has not been consulted yet.",
        }),
        found: z
          .array(z.string())
          .meta({ description: "What DNS returned when it did not match." }),
      })
      .meta({
        description:
          "The MX record to publish, with the result of the last check. Mail for the hostname " +
          "is received as soon as it reaches coss.com; the check only shows what DNS serves.",
      }),
    created_at: z.iso.datetime(),
    last_checked_at: z.iso.datetime().nullable(),
  })
  .meta({
    id: "ReceivingDomain",
    description:
      "A domain's receiving hostname: email sent to any address at it becomes a received email " +
      "of its environment.",
    examples: [RECEIVING_DOMAIN_EXAMPLE],
  });

export type ReceivingDomainObjectOutput = z.output<typeof ReceivingDomainObject>;

export const DomainObject = z
  .object({
    object: z.literal("domain"),
    id: z.string().meta({ examples: [DOMAIN_ID_EXAMPLE] }),
    name: z.string().meta({ description: "The domain, lower-cased.", examples: ["acme.com"] }),
    status: z.enum(DOMAIN_STATUSES).meta({
      description:
        "`pending` while the records are being checked, `verified` once they are, " +
        "`temporary_failure` after a transient DNS problem, and `failed` when verification gave " +
        "up (72 hours) — restart it with the verify endpoint. `deleting` is a removal in progress.",
    }),
    can_send: z
      .boolean()
      .meta({ description: "Whether live keys may send from this domain right now." }),
    region: z.string().nullable(),
    mail_from_domain: z
      .string()
      .meta({ description: "The envelope sender subdomain bounces come back to." }),
    mail_from_status: z.enum(MAIL_FROM_STATUSES),
    records: z
      .array(DomainRecordObject)
      .meta({ description: "The DNS records to publish, with the result of the last check." }),
    created_at: z.iso.datetime(),
    last_checked_at: z.iso.datetime().nullable(),
    verified_at: z.iso.datetime().nullable(),
    failed_at: z.iso.datetime().nullable(),
    // The custom tracking domain (`null` when none is set up). A union, not `.nullable()`, and no
    // `.meta()`: the OpenAPI generator would drop the `null` or inline the `TrackingDomain` schema.
    tracking: z.union([TrackingDomainObject, z.null()]),
    // The receiving hostname (`null` when the domain doesn't receive email). A union, like `tracking`.
    receiving: z.union([ReceivingDomainObject, z.null()]),
    bimi: DomainBimiObject,
    subaccount_id: z.string().nullable().meta({
      description:
        "The sub-account the domain belongs to (only it sends from it, with its own reputation); `null` for the organization's own.",
    }),
    shared_with_subaccounts: z.boolean().meta({
      description: "An organization's domain its sub-accounts may send from too.",
    }),
  })
  .meta({ id: "Domain", examples: [DOMAIN_EXAMPLE] });

export type DomainObjectOutput = z.output<typeof DomainObject>;

export const DEDICATED_IP_POOL_STATUSES = [
  "not_enabled",
  "waiting",
  "provisioning",
  "warming",
  "ready",
  "releasing",
] as const;

const DEDICATED_IP_POOL_EXAMPLE = {
  object: "dedicated_ip_pool",
  status: "warming",
  ips: [{ ip: "198.51.100.10", delivered_7d: 18_420 }],
  dedicated_share: 0.72,
  message: null,
  created_at: "2026-10-12T09:31:00.000Z",
  ready_at: null,
} as const;

export const DedicatedIpPoolObject = z
  .object({
    object: z.literal("dedicated_ip_pool"),
    status: z.enum(DEDICATED_IP_POOL_STATUSES).meta({
      description:
        "`not_enabled` without the Dedicated IPs add-on. `provisioning` while the pool is set " +
        "up (`waiting` when none is free yet), then `warming`: live emails go through the pool " +
        "while it warms up its IPs, sending what they can't take yet from shared IPs. `ready` " +
        "once at least 95% of the last 7 days' deliveries (at least 1,000) left from your " +
        "dedicated IPs. `releasing` after the add-on ends: emails are back on shared IPs, and " +
        "the pool is released a day later.",
    }),
    ips: z
      .array(
        z.object({
          ip: z.string().meta({ description: "An IPv4 address of the pool." }),
          delivered_7d: z.int().meta({ description: "Deliveries from it in the last 7 days." }),
        }),
      )
      .meta({ description: "The pool's IPs; the provider adds and removes them with volume." }),
    dedicated_share: z
      .number()
      .nullable()
      .meta({
        description:
          "Share (0–1) of the last 7 days' deliveries that left from the pool's IPs (`null`: " +
          "fewer than 1,000).",
      }),
    message: z
      .string()
      .nullable()
      .meta({ description: "What is holding the pool up, if anything." }),
    created_at: z.iso.datetime().nullable(),
    ready_at: z.iso.datetime().nullable().meta({ description: "When it was first `ready`." }),
  })
  .meta({
    id: "DedicatedIpPool",
    description:
      "Your organization's dedicated IPs (the Dedicated IPs add-on): a pool managed and warmed " +
      "up automatically.",
    examples: [DEDICATED_IP_POOL_EXAMPLE],
  });

export type DedicatedIpPoolObjectOutput = z.output<typeof DedicatedIpPoolObject>;

export const DomainList = z
  .object({
    object: z.literal("list"),
    data: z.array(DomainObject),
    has_more: z.boolean(),
  })
  .meta({
    id: "DomainList",
    examples: [{ object: "list", data: [DOMAIN_EXAMPLE], has_more: false }],
  });

export type DomainListOutput = z.output<typeof DomainList>;

export const DOMAIN_NAME_MAX_LENGTH = 200;

export const CreateDomainRequest = z
  .strictObject({
    name: z
      .string()
      .min(1, "Enter a domain name, like acme.com.")
      .max(
        DOMAIN_NAME_MAX_LENGTH,
        `Domain names can be at most ${DOMAIN_NAME_MAX_LENGTH} characters.`,
      )
      .meta({
        description:
          "The domain to send from, without a scheme or path. Subdomains are allowed; " +
          "internationalized domains must be punycode-encoded.",
        examples: ["acme.com"],
      }),
    subaccount: SubaccountRef.optional().meta({
      description:
        "Add it for one of your live sub-accounts (its id or your uid): only that sub-account sends " +
        "from it, through its own reputation.",
      examples: ["user_8812"],
    }),
  })
  .meta({ id: "CreateDomainRequest", examples: [{ name: "acme.com" }] });

export const ListDomainsQuery = z.strictObject({
  subaccount: SubaccountRef.optional().meta({
    description: "Only this sub-account's domains (its id or your uid).",
  }),
});

export const UpdateDomainRequest = z
  .strictObject({
    shared_with_subaccounts: z.boolean().meta({
      description:
        "Let your sub-accounts send from this domain of yours (through your organization's reputation).",
    }),
  })
  .meta({ id: "UpdateDomainRequest", examples: [{ shared_with_subaccounts: true }] });

export type CreateDomainRequestInput = z.input<typeof CreateDomainRequest>;

export const DeletedDomain = z
  .object({
    object: z.literal("domain"),
    id: z.string(),
    deleted: z.literal(true),
  })
  .meta({
    id: "DeletedDomain",
    examples: [{ object: "domain", id: DOMAIN_ID_EXAMPLE, deleted: true }],
  });

export type DeletedDomainOutput = z.output<typeof DeletedDomain>;

export const CreateTrackingDomainRequest = z
  .strictObject({
    hostname: z
      .string()
      .min(1, "Enter a hostname, like links.acme.com.")
      .max(DOMAIN_NAME_MAX_LENGTH, `Hostnames can be at most ${DOMAIN_NAME_MAX_LENGTH} characters.`)
      .meta({
        description:
          "A subdomain of the domain to serve tracking links from, without a scheme or path. " +
          "Point it at coss.com with the CNAME record the response lists.",
        examples: ["links.acme.com"],
      }),
  })
  .meta({ id: "CreateTrackingDomainRequest", examples: [{ hostname: "links.acme.com" }] });

export type CreateTrackingDomainRequestInput = z.input<typeof CreateTrackingDomainRequest>;
/** An address of a list entry: validated, then stored bare and lower-cased. */
export const SuppressionAddress = z
  .string()
  .superRefine((value, ctx) => {
    const problem = emailAddressProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .transform(addressKey);

const suppressionListRef = (action: string) =>
  SubaccountRef.optional().meta({
    description: `${action} a sub-account's own list (its id or your uid) instead of the environment's.`,
    examples: ["user_8812"],
  });

export const CreateSuppressionRequest = z
  .strictObject({
    address: SuppressionAddress.meta({
      description:
        "The address to suppress. Display names are ignored; matching is case-insensitive.",
    }),
    scope: SuppressionScope.optional().meta({
      description:
        'Defaults to `*` (every email). Pass a category, e.g. "marketing", to only skip those.',
    }),
    subaccount: suppressionListRef("Add it to"),
  })
  .transform((value) => ({
    address: value.address,
    scope: value.scope ?? ALL_CATEGORIES,
    ...(value.subaccount === undefined ? {} : { subaccount: value.subaccount }),
  }))
  .meta({
    id: "CreateSuppressionRequest",
    examples: [{ address: "user@example.com", scope: "marketing" }],
  });

export type CreateSuppressionRequestInput = z.input<typeof CreateSuppressionRequest>;
export type CreateSuppressionRequestOutput = z.output<typeof CreateSuppressionRequest>;

export const DEFAULT_SUPPRESSION_LIST_LIMIT = 50;
export const MAX_SUPPRESSION_LIST_LIMIT = 100;

export const ListSuppressionsQuery = z.strictObject({
  subaccount: suppressionListRef("List"),
  address: SuppressionAddress.optional().meta({ description: "Only entries for this address." }),
  scope: SuppressionScope.optional().meta({ description: "Only entries with this scope." }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_SUPPRESSION_LIST_LIMIT)
    .optional()
    .meta({
      description: `1-${MAX_SUPPRESSION_LIST_LIMIT}, default ${DEFAULT_SUPPRESSION_LIST_LIMIT}.`,
    }),
  after: z
    .string()
    .optional()
    .meta({ description: "Cursor: the `id` of the last entry of the previous page." }),
});

export type ListSuppressionsQueryOutput = z.output<typeof ListSuppressionsQuery>;

export const CheckSuppressionQuery = z.strictObject({
  address: SuppressionAddress.meta({
    description: "The address to check.",
    examples: ["user@example.com"],
  }),
  category: Category.optional().meta({
    description: "The category of the email you plan to send. Without it, only `*` entries count.",
  }),
  stream: z
    .enum(EMAIL_STREAMS)
    .optional()
    .meta({
      description:
        "The stream of the email you plan to send (default `transactional`). `marketing` also " +
        "counts `stream:marketing` entries.",
    }),
  subaccount: SubaccountRef.optional().meta({
    description:
      "The sub-account you plan to send for (its id or your uid): its own entries count too.",
  }),
});

export type CheckSuppressionQueryOutput = z.output<typeof CheckSuppressionQuery>;

const SUPPRESSION_ID_EXAMPLE = "sup_01k7c8m4q2f3e9v6t5r1n0p8yz";
const SUPPRESSION_EXAMPLE = {
  object: "suppression",
  id: SUPPRESSION_ID_EXAMPLE,
  address: "user@example.com",
  scope: "marketing",
  reason: "manual",
  email_id: null,
  subaccount_id: null,
  created_at: "2026-01-15T09:30:00.000Z",
} as const;

export const Suppression = z
  .object({
    object: z.literal("suppression"),
    id: z.string().meta({ examples: [SUPPRESSION_ID_EXAMPLE] }),
    address: z.string().meta({ description: "The bare, lower-cased address." }),
    scope: z.string().meta({ description: "`*` (every email) or a category." }),
    reason: SuppressionReasonEnum,
    email_id: z
      .string()
      .nullable()
      .meta({ description: "The email whose bounce or complaint added this entry." }),
    subaccount_id: z.string().nullable().meta({
      description: "The sub-account whose list it is on; `null` for the environment's own list.",
    }),
    created_at: z.iso.datetime(),
  })
  .meta({ id: "Suppression", examples: [SUPPRESSION_EXAMPLE] });

export type SuppressionOutput = z.output<typeof Suppression>;

export const SuppressionList = z
  .object({
    object: z.literal("list"),
    data: z.array(Suppression),
    has_more: z.boolean(),
  })
  .meta({
    id: "SuppressionList",
    examples: [{ object: "list", data: [SUPPRESSION_EXAMPLE], has_more: false }],
  });

export type SuppressionListOutput = z.output<typeof SuppressionList>;

export const SuppressionCheck = z
  .object({
    object: z.literal("suppression_check"),
    address: z.string(),
    suppressed: z
      .boolean()
      .meta({ description: "Whether a send (with the given category) would skip this address." }),
    suppressions: z.array(Suppression).meta({ description: "The entries that match." }),
  })
  .meta({
    id: "SuppressionCheck",
    examples: [
      {
        object: "suppression_check",
        address: "user@example.com",
        suppressed: true,
        suppressions: [SUPPRESSION_EXAMPLE],
      },
    ],
  });

export type SuppressionCheckOutput = z.output<typeof SuppressionCheck>;

export const DeletedSuppression = z
  .object({
    object: z.literal("suppression"),
    id: z.string(),
    deleted: z.literal(true),
  })
  .meta({
    id: "DeletedSuppression",
    examples: [{ object: "suppression", id: SUPPRESSION_ID_EXAMPLE, deleted: true }],
  });

export type DeletedSuppressionOutput = z.output<typeof DeletedSuppression>;

/** An environment's tracking default (`category: null`) or a category's override. */
export const TrackingRuleInput = z.strictObject({
  category: Category.nullable(),
  opens: z.boolean(),
  clicks: z.boolean(),
  unsubscribe: z.boolean(),
});

export type TrackingRuleInputOutput = z.output<typeof TrackingRuleInput>;

const TRACKING_RULE_ID_EXAMPLE = "etr_01k7c8m4q2f3e9v6t5r1n0p8yz";
const TRACKING_DEFAULT_EXAMPLE = {
  object: "tracking_rule",
  id: "etr_01k7c8k1d9w4x2b7n3m5q6r8st",
  category: null,
  opens: true,
  clicks: true,
  unsubscribe: false,
  created_at: "2026-01-15T09:30:00.000Z",
  updated_at: "2026-01-15T09:30:00.000Z",
} as const;
const TRACKING_RULE_EXAMPLE = {
  object: "tracking_rule",
  id: TRACKING_RULE_ID_EXAMPLE,
  category: "password-reset",
  opens: false,
  clicks: false,
  unsubscribe: false,
  created_at: "2026-01-16T10:00:00.000Z",
  updated_at: "2026-01-16T10:00:00.000Z",
} as const;

export const TrackingRule = z
  .object({
    object: z.literal("tracking_rule"),
    id: z.string().meta({ examples: [TRACKING_RULE_ID_EXAMPLE] }),
    category: z.string().nullable().meta({
      description: "The category the rule applies to; `null` for the environment default.",
    }),
    opens: z.boolean().meta({ description: "Whether opens are tracked." }),
    clicks: z.boolean().meta({ description: "Whether clicks are tracked." }),
    unsubscribe: z.boolean().meta({
      description:
        "Whether emails get one-click unsubscribe headers (only emails with a category and a " +
        "single recipient).",
    }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({
    id: "TrackingRule",
    description:
      "An environment's tracking default (`category: null`) or the rule for one category. " +
      "Emails are fixed to the settings that applied when they were sent.",
    examples: [TRACKING_RULE_EXAMPLE],
  });

export type TrackingRuleOutput = z.output<typeof TrackingRule>;

export const TrackingSettings = z
  .object({
    object: z.literal("tracking_settings"),
    // A union, not `.nullable()`, and no `.meta()`: the OpenAPI generator would drop the `null`
    // or inline the `TrackingRule` schema (as for `Domain.tracking`).
    default: z.union([TrackingRule, z.null()]),
    categories: z.array(TrackingRule).meta({ description: "Category rules, by category name." }),
  })
  .meta({
    id: "TrackingSettings",
    description:
      "Open and click tracking and one-click unsubscribe settings of the API key's environment. " +
      "For each of `opens`, `clicks` and `unsubscribe`, a send's own `tracking` wins, then its " +
      "category's rule, then `default` (the environment default; `null` when none is set), " +
      "then off.",
    examples: [
      {
        object: "tracking_settings",
        default: TRACKING_DEFAULT_EXAMPLE,
        categories: [TRACKING_RULE_EXAMPLE],
      },
    ],
  });

export type TrackingSettingsOutput = z.output<typeof TrackingSettings>;

export const UpdateTrackingRuleRequest = z
  .strictObject({
    opens: z.boolean().optional().meta({ description: "Track opens." }),
    clicks: z.boolean().optional().meta({ description: "Track clicks." }),
    unsubscribe: z.boolean().optional().meta({
      description:
        "Add one-click unsubscribe headers to emails with a category and a single recipient.",
    }),
  })
  .refine(
    (value) =>
      value.opens !== undefined || value.clicks !== undefined || value.unsubscribe !== undefined,
    { error: "Provide opens, clicks or unsubscribe." },
  )
  .meta({
    id: "UpdateTrackingRuleRequest",
    description:
      "Fields left out keep their current value; a new rule starts with all off. A send's own " +
      "`tracking` option still wins over the rule.",
    examples: [{ opens: false, clicks: false }],
  });

export type UpdateTrackingRuleRequestInput = z.input<typeof UpdateTrackingRuleRequest>;
export type UpdateTrackingRuleRequestOutput = z.output<typeof UpdateTrackingRuleRequest>;

export const TrackingCategoryParams = z.object({
  category: Category.meta({
    description: "The category, as sent in `category`.",
    examples: ["password-reset"],
  }),
});

export const DeletedTrackingRule = z
  .object({
    object: z.literal("tracking_rule"),
    id: z.string(),
    category: z.string().nullable(),
    deleted: z.literal(true),
  })
  .meta({
    id: "DeletedTrackingRule",
    examples: [
      {
        object: "tracking_rule",
        id: TRACKING_RULE_ID_EXAMPLE,
        category: "password-reset",
        deleted: true,
      },
    ],
  });

export type DeletedTrackingRuleOutput = z.output<typeof DeletedTrackingRule>;

export const StorageSettings = z
  .object({
    object: z.literal("storage_settings"),
    content_storage: z.enum(CONTENT_STORAGE_MODES).meta({
      description:
        "`store` (the default) keeps each email's content (subject, body, headers, template " +
        "variables, attachment filenames) for the email retention period. `discard` keeps it " +
        "only until the email is sent, fails or is canceled; its metadata (addresses, tags, " +
        "category, status, recipients, events) is kept as usual.",
    }),
    updated_at: z.iso.datetime().nullable().meta({
      description: "When the setting last changed; `null` if it never did (content is stored).",
    }),
  })
  .meta({
    id: "StorageSettings",
    description:
      "What coss.com keeps of the API key's environment's emails. Emails keep the setting " +
      "that applied when they were sent.",
    examples: [
      {
        object: "storage_settings",
        content_storage: "discard",
        updated_at: "2026-10-16T10:00:00.000Z",
      },
    ],
  });

export type StorageSettingsOutput = z.output<typeof StorageSettings>;

export const UpdateStorageSettingsRequest = z
  .strictObject({
    content_storage: z.enum(CONTENT_STORAGE_MODES).meta({
      description: "`store` keeps emails' content; `discard` clears it once they are sent.",
    }),
  })
  .meta({
    id: "UpdateStorageSettingsRequest",
    description: "Applies to emails sent from now on; emails already sent keep their setting.",
    examples: [{ content_storage: "discard" }],
  });

export type UpdateStorageSettingsRequestInput = z.input<typeof UpdateStorageSettingsRequest>;
export type UpdateStorageSettingsRequestOutput = z.output<typeof UpdateStorageSettingsRequest>;
export const MAX_SUPPRESSION_IMPORT_ENTRIES = 1000;

export const ImportSuppressionsRequest = z
  .strictObject({
    subaccount: suppressionListRef("Import into"),
    suppressions: z
      .array(
        z.strictObject({
          address: z.string().meta({ description: "The address to suppress." }),
          scope: z.string().optional().meta({ description: "`*` (the default) or a category." }),
        }),
      )
      .min(1, "Provide at least one suppression.")
      .max(
        MAX_SUPPRESSION_IMPORT_ENTRIES,
        `At most ${MAX_SUPPRESSION_IMPORT_ENTRIES} suppressions can be imported per request.`,
      )
      .meta({
        description:
          `1-${MAX_SUPPRESSION_IMPORT_ENTRIES} entries. Each one is validated on its own: invalid ` +
          "entries are skipped and reported in `invalid`, the rest are imported.",
      }),
  })
  .meta({
    id: "ImportSuppressionsRequest",
    examples: [
      {
        suppressions: [
          { address: "user@example.com" },
          { address: "other@example.com", scope: "marketing" },
        ],
      },
    ],
  });

export type ImportSuppressionsRequestInput = z.input<typeof ImportSuppressionsRequest>;
export type ImportSuppressionsRequestOutput = z.output<typeof ImportSuppressionsRequest>;

export const SuppressionImport = z
  .object({
    object: z.literal("suppression_import"),
    created: z.number().int().meta({ description: "Entries added by this import." }),
    existing: z.number().int().meta({
      description:
        "Valid entries that were already on the list (or repeated within this import); unchanged.",
    }),
    invalid: z
      .array(
        z.object({
          index: z.number().int().meta({ description: "Position of the entry in the request." }),
          address: z.string(),
          message: z.string(),
        }),
      )
      .meta({ description: "Entries that were skipped, with the reason." }),
  })
  .meta({
    id: "SuppressionImport",
    examples: [
      {
        object: "suppression_import",
        created: 2,
        existing: 0,
        invalid: [],
      },
    ],
  });

export type SuppressionImportOutput = z.output<typeof SuppressionImport>;

export const ExportSuppressionsQuery = z.strictObject({
  subaccount: suppressionListRef("Export"),
  scope: SuppressionScope.optional().meta({ description: "Only entries with this scope." }),
  reason: SuppressionReasonEnum.optional().meta({
    description: "Only entries with this reason.",
    examples: ["bounce"],
  }),
});

export type ExportSuppressionsQueryOutput = z.output<typeof ExportSuppressionsQuery>;

export const RECEIVED_EMAIL_STATUSES = ["received", "blocked"] as const;
export const RECEIVED_EMAIL_BLOCKED_REASONS = ["virus"] as const;
export const VERDICT_STATUSES = ["pass", "fail", "gray", "processing_failed"] as const;
export const ATTACHMENT_DISPOSITIONS = ["attachment", "inline"] as const;
export const DEFAULT_RECEIVED_EMAIL_LIST_LIMIT = 20;
export const MAX_RECEIVED_EMAIL_LIST_LIMIT = 100;

const RECEIVED_EMAIL_ID_EXAMPLE = "rcvd_01k7c8m4q2f3e9v6t5r1n0p8yz";
const RECEIVED_ATTACHMENT_EXAMPLE = {
  id: "rcvdatt_01k7c8m4r0c2b8w9y3d5f6g7h8",
  filename: "invoice.pdf",
  content_type: "application/pdf",
  content_id: null,
  disposition: "attachment",
  size: 48213,
} as const;
const VERDICTS_EXAMPLE = {
  spam: "pass",
  virus: "pass",
  spf: "pass",
  dkim: "pass",
  dmarc: "pass",
  dmarc_policy: null,
} as const;
const RECEIVED_EMAIL_SUMMARY_EXAMPLE = {
  object: "received_email",
  id: RECEIVED_EMAIL_ID_EXAMPLE,
  status: "received",
  blocked_reason: null,
  mail_from: "jane@example.com",
  recipients: ["support@inbound.acme.com"],
  from: "Jane Doe <jane@example.com>",
  to: ["support@inbound.acme.com"],
  cc: [],
  subject: "Re: Your order",
  message_id: "<CAF3k2m9qp4ld8sv@mail.example.com>",
  attachments: [RECEIVED_ATTACHMENT_EXAMPLE],
  size: 61432,
  spam: false,
  verdicts: VERDICTS_EXAMPLE,
  sandbox: false,
  received_at: "2026-10-10T12:00:00.000Z",
} as const;
const RECEIVED_EMAIL_EXAMPLE = {
  ...RECEIVED_EMAIL_SUMMARY_EXAMPLE,
  reply_to: [],
  in_reply_to: "<x7f3k2m9qp4ld8sv@acme.com>",
  references: ["<x7f3k2m9qp4ld8sv@acme.com>"],
  sent_at: "2026-10-10T11:59:58.000Z",
  headers: [
    { name: "From", value: "Jane Doe <jane@example.com>" },
    { name: "To", value: "support@inbound.acme.com" },
    { name: "Subject", value: "Re: Your order" },
  ],
  text: "Hi, the order arrived damaged.",
  html: "<p>Hi, the order arrived damaged.</p>",
  truncated: false,
} as const;

export const ReceivedEmailAttachmentObject = z
  .object({
    id: z.string(),
    filename: z.string().nullable().meta({ description: "`null` when the part named none." }),
    content_type: z.string(),
    content_id: z
      .string()
      .nullable()
      .meta({ description: "Set for parts the HTML references (`cid:` URLs)." }),
    disposition: z.enum(ATTACHMENT_DISPOSITIONS),
    size: z.number().int().meta({ description: "Size in bytes." }),
  })
  .meta({ id: "ReceivedEmailAttachment", examples: [RECEIVED_ATTACHMENT_EXAMPLE] });

const Verdict = z.union([z.enum(VERDICT_STATUSES), z.null()]);

export const ReceivedEmailVerdicts = z
  .object({
    spam: Verdict,
    virus: Verdict,
    spf: Verdict,
    dkim: Verdict,
    dmarc: Verdict,
    dmarc_policy: z.string().nullable().meta({
      description:
        "The sender domain's DMARC policy (`none`, `quarantine` or `reject`) when DMARC failed.",
    }),
  })
  .meta({
    id: "ReceivedEmailVerdicts",
    description:
      "What the receiving server concluded: `pass`, `fail`, `gray` (could not decide) or " +
      "`processing_failed`; `null` when the check did not run.",
    examples: [VERDICTS_EXAMPLE],
  });

const receivedEmailSummaryShape = {
  object: z.literal("received_email"),
  id: z.string().meta({ examples: [RECEIVED_EMAIL_ID_EXAMPLE] }),
  status: z.enum(RECEIVED_EMAIL_STATUSES).meta({
    description:
      "`received`, or `blocked` when the message carried a virus: then only its envelope and " +
      "verdicts are kept, never its content.",
  }),
  blocked_reason: z.union([z.enum(RECEIVED_EMAIL_BLOCKED_REASONS), z.null()]),
  mail_from: z.string().meta({
    description: "The envelope sender (`MAIL FROM`); empty for bounces.",
  }),
  recipients: z.array(z.string()).meta({
    description:
      "The envelope recipients this environment received the message for (Bcc'd addresses " +
      "included, other organizations' never).",
  }),
  from: z.string().nullable().meta({ description: "The `From` header." }),
  to: z.array(z.string()).meta({ description: "The `To` header's addresses." }),
  cc: z.array(z.string()).meta({ description: "The `Cc` header's addresses." }),
  subject: z.string().nullable(),
  message_id: z.string().nullable().meta({ description: "The `Message-ID` header." }),
  attachments: z.array(ReceivedEmailAttachmentObject),
  size: z.number().int().meta({ description: "Size of the raw message in bytes." }),
  spam: z.boolean().meta({ description: "Whether the spam verdict is `fail`." }),
  verdicts: ReceivedEmailVerdicts,
  sandbox: z.boolean().meta({ description: "Whether it was received by a sandbox environment." }),
  received_at: z.iso.datetime(),
};

export const ReceivedEmailSummary = z
  .object(receivedEmailSummaryShape)
  .meta({ id: "ReceivedEmailSummary", examples: [RECEIVED_EMAIL_SUMMARY_EXAMPLE] });

export type ReceivedEmailSummaryOutput = z.output<typeof ReceivedEmailSummary>;

export const ReceivedEmailObject = z
  .object({
    ...receivedEmailSummaryShape,
    reply_to: z.array(z.string()),
    in_reply_to: z.string().nullable(),
    references: z
      .array(z.string())
      .meta({ description: "Message ids of the `References` header." }),
    sent_at: z.iso.datetime().nullable().meta({ description: "The `Date` header, when valid." }),
    headers: z
      .array(z.object({ name: z.string(), value: z.string() }))
      .meta({ description: "Every header in message order (duplicates included)." }),
    text: z.string().nullable(),
    html: z.string().nullable(),
    truncated: z.boolean().meta({
      description:
        "Whether `text`, `html` or `headers` were shortened (2 MB per body, 64 KB of headers). " +
        "The raw message always has all of it.",
    }),
  })
  .meta({ id: "ReceivedEmail", examples: [RECEIVED_EMAIL_EXAMPLE] });

export type ReceivedEmailObjectOutput = z.output<typeof ReceivedEmailObject>;

export const ReceivedEmailList = z
  .object({
    object: z.literal("list"),
    data: z.array(ReceivedEmailSummary),
    has_more: z.boolean(),
  })
  .meta({
    id: "ReceivedEmailList",
    examples: [{ object: "list", data: [RECEIVED_EMAIL_SUMMARY_EXAMPLE], has_more: false }],
  });

export type ReceivedEmailListOutput = z.output<typeof ReceivedEmailList>;

export const ListReceivedEmailsQuery = z
  .strictObject({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_RECEIVED_EMAIL_LIST_LIMIT)
      .optional()
      .meta({
        description: `1-${MAX_RECEIVED_EMAIL_LIST_LIMIT}, default ${DEFAULT_RECEIVED_EMAIL_LIST_LIMIT}.`,
      }),
    after: z
      .string()
      .max(64)
      .optional()
      .meta({ description: "Cursor: the `id` of the last email of the previous page." }),
  })
  .meta({ description: "Received emails are returned newest first." });

export type ListReceivedEmailsQueryOutput = z.output<typeof ListReceivedEmailsQuery>;

export const DeletedReceivedEmail = z
  .object({
    object: z.literal("received_email"),
    id: z.string(),
    deleted: z.literal(true),
  })
  .meta({
    id: "DeletedReceivedEmail",
    examples: [{ object: "received_email", id: RECEIVED_EMAIL_ID_EXAMPLE, deleted: true }],
  });

export type DeletedReceivedEmailOutput = z.output<typeof DeletedReceivedEmail>;

export const InboundAddressObject = z
  .object({
    object: z.literal("inbound_address"),
    environment_id: z.string(),
    domain: z.string().meta({
      description:
        "Email sent to any address at this domain is received by the environment, with no DNS " +
        "setup. It never changes.",
    }),
  })
  .meta({
    id: "InboundAddress",
    examples: [
      {
        object: "inbound_address",
        environment_id: "env_01k7c8m4q2f3e9v6t5r1n0p8yz",
        domain: "k3j9x2m7qp4l.inbound.coss.com",
      },
    ],
  });

export type InboundAddressObjectOutput = z.output<typeof InboundAddressObject>;

export const CreateReceivingDomainRequest = z
  .strictObject({
    hostname: z
      .string()
      .min(1, "Enter a hostname, like inbound.acme.com.")
      .max(DOMAIN_NAME_MAX_LENGTH, `Hostnames can be at most ${DOMAIN_NAME_MAX_LENGTH} characters.`)
      .meta({
        description:
          "The domain itself or a subdomain of it, without a scheme or path. Point its MX at " +
          "coss.com with the record the response lists. Using the domain itself moves all of its " +
          "mail to coss.com, so a subdomain is usually the better choice.",
        examples: ["inbound.acme.com"],
      }),
  })
  .meta({ id: "CreateReceivingDomainRequest", examples: [{ hostname: "inbound.acme.com" }] });

export type CreateReceivingDomainRequestInput = z.input<typeof CreateReceivingDomainRequest>;

/**
 * Body of an `email.received` webhook request: who sent what to whom, never the content, the
 * headers or the Cc addresses (read those with the received email's id).
 */
export const ReceivedEmailWebhookEvent = z
  .object({
    id: z.string().meta({
      description: "The event id, and the `webhook-id` header.",
      examples: ["evt_01k7c8m4r0c2b8w9y3d5f6g7h9"],
    }),
    object: z.literal("event"),
    type: z.enum(RECEIVED_EMAIL_EVENT_TYPES),
    api_version: z.string().meta({
      description:
        "The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.",
      examples: [LATEST_API_VERSION],
    }),
    created_at: z.iso.datetime(),
    data: z.object({
      received_email_id: z.string(),
      from: z.string().nullable(),
      to: z.array(z.string()),
      recipients: z.array(z.string()),
      subject: z.string().nullable(),
      message_id: z.string().nullable(),
      attachment_count: z.number().int(),
      size: z.number().int(),
      spam: z.boolean(),
      verdicts: ReceivedEmailVerdicts,
      sandbox: z.boolean(),
      received_at: z.iso.datetime(),
    }),
  })
  .meta({
    id: "ReceivedEmailWebhookEvent",
    examples: [
      {
        id: "evt_01k7c8m4r0c2b8w9y3d5f6g7h9",
        object: "event",
        type: "email.received",
        api_version: LATEST_API_VERSION,
        created_at: "2026-10-10T12:00:01.000Z",
        data: {
          received_email_id: RECEIVED_EMAIL_ID_EXAMPLE,
          from: RECEIVED_EMAIL_SUMMARY_EXAMPLE.from,
          to: RECEIVED_EMAIL_SUMMARY_EXAMPLE.to,
          recipients: RECEIVED_EMAIL_SUMMARY_EXAMPLE.recipients,
          subject: RECEIVED_EMAIL_SUMMARY_EXAMPLE.subject,
          message_id: RECEIVED_EMAIL_SUMMARY_EXAMPLE.message_id,
          attachment_count: 1,
          size: RECEIVED_EMAIL_SUMMARY_EXAMPLE.size,
          spam: false,
          verdicts: VERDICTS_EXAMPLE,
          sandbox: false,
          received_at: RECEIVED_EMAIL_SUMMARY_EXAMPLE.received_at,
        },
      },
    ],
  });

export type ReceivedEmailWebhookEventOutput = z.output<typeof ReceivedEmailWebhookEvent>;
/** What the outbox stores: delivery adds `api_version` when it renders the event for an endpoint. */
export type StoredReceivedEmailWebhookEvent = Omit<ReceivedEmailWebhookEventOutput, "api_version">;

// --- DMARC ---------------------------------------------------------------------------------------

export const DMARC_POLICY_VALUES = ["none", "quarantine", "reject"] as const;
export const DMARC_STAGES = [
  "not_checked",
  "no_record",
  "monitoring",
  "quarantine",
  "reject",
] as const;
export const DMARC_CHECK_IDS = [
  "coverage",
  "recent",
  "complete",
  "time_at_policy",
  "coss_pass_rate",
  "pass_rate",
  "sources",
] as const;
export const DMARC_NEXT_STEP_KINDS = [
  "publish",
  "add_reporting",
  "complete_rollout",
  "tighten",
] as const;
export const DMARC_DISPOSITIONS = ["none", "quarantine", "reject"] as const;
export const DMARC_ALIGNED_RESULTS = ["pass", "fail"] as const;
export const MAX_DMARC_REPORT_LIST_LIMIT = 100;
export const DEFAULT_DMARC_REPORT_LIST_LIMIT = 20;

const DMARC_REPORT_ADDRESS_EXAMPLE = "dmarc-k3x9m2pq7rtw4nbc@inbound.coss.com";
const DMARC_REPORT_ID_EXAMPLE = "dmarcrep_01k7c8m4q2f3e9v6t5r1n0p8yz";
const DmarcPolicyValue = z.enum(DMARC_POLICY_VALUES);
const DMARC_PUBLISHED_RECORD_EXAMPLE = {
  value: `v=DMARC1; p=none; rua=mailto:${DMARC_REPORT_ADDRESS_EXAMPLE};`,
  p: "none",
  sp: null,
  np: null,
  adkim: null,
  aspf: null,
  pct: null,
  t: null,
  rua: [`mailto:${DMARC_REPORT_ADDRESS_EXAMPLE}`],
};
const Alignment = z.enum(["r", "s"]);

export const DmarcPublishedRecord = z
  .object({
    value: z.string().meta({ description: "The `v=DMARC1` TXT record as published." }),
    p: z.union([DmarcPolicyValue, z.null()]),
    sp: z.union([DmarcPolicyValue, z.null()]),
    np: z.union([DmarcPolicyValue, z.null()]),
    adkim: z.union([Alignment, z.null()]),
    aspf: z.union([Alignment, z.null()]),
    pct: z.union([z.number().int(), z.null()]).meta({
      description: "Removed by RFC 9989 but still honored by many receivers.",
    }),
    t: z.union([z.enum(["y", "n"]), z.null()]),
    rua: z.array(z.string()).meta({ description: "Aggregate report addresses." }),
  })
  .meta({
    id: "DmarcPublishedRecord",
    description: "The DMARC record found at `_dmarc.<domain>` by the latest DNS check.",
    examples: [DMARC_PUBLISHED_RECORD_EXAMPLE],
  });

const DMARC_SOURCE_EXAMPLE = {
  source_ip: "54.240.8.12",
  header_from: "acme.com",
  messages: 1840,
  passing: 1840,
  via_coss: true,
};

export const DmarcSource = z
  .object({
    source_ip: z.string(),
    header_from: z.string().meta({ description: "The domain in the messages' From header." }),
    messages: z.number().int(),
    passing: z.number().int().meta({ description: "Messages that passed DMARC." }),
    via_coss: z.boolean().meta({
      description:
        "Signed with the domain's coss.com DKIM keys or sent from its coss.com MAIL FROM domain.",
    }),
  })
  .meta({ id: "DmarcSource", examples: [DMARC_SOURCE_EXAMPLE] });

const DMARC_CHECK_EXAMPLE = {
  id: "coss_pass_rate",
  ok: true,
  message: "100% of mail sent through coss.com passes DMARC (99% needed).",
};

const DOMAIN_DMARC_EXAMPLE = {
  object: "domain_dmarc",
  domain_id: DOMAIN_ID_EXAMPLE,
  report_address: DMARC_REPORT_ADDRESS_EXAMPLE,
  record: DMARC_PUBLISHED_RECORD_EXAMPLE,
  policy: "none",
  inherited_from: null,
  policy_since: "2026-09-20T08:00:00.000Z",
  stage: "monitoring",
  partial: false,
  reporting: true,
  ready: true,
  next: {
    kind: "tighten",
    policy: "quarantine",
    record: `v=DMARC1; p=quarantine; rua=mailto:${DMARC_REPORT_ADDRESS_EXAMPLE};`,
  },
  checks: [DMARC_CHECK_EXAMPLE],
  warnings: [],
  report_summary: {
    period_start: "2026-09-26T00:00:00.000Z",
    period_end: "2026-10-10T00:00:00.000Z",
    reports: 28,
    messages: 1846,
    passing: 1840,
    coss_messages: 1840,
    coss_passing: 1840,
    first_report_at: "2026-09-21T00:00:00.000Z",
    last_report_at: "2026-10-09T23:59:59.000Z",
    sources: [DMARC_SOURCE_EXAMPLE],
  },
};

export const DomainDmarc = z
  .object({
    object: z.literal("domain_dmarc"),
    domain_id: z.string(),
    report_address: z.union([z.string(), z.null()]).meta({
      description:
        "Where the domain's DMARC aggregate reports go (`rua=mailto:…`). `null` when this " +
        "deployment doesn't receive email.",
    }),
    // The domain's own valid record (`null`: none found or invalid, or DNS not checked yet). A
    // union, not `.nullable()`.
    record: z.union([DmarcPublishedRecord, z.null()]),
    policy: z.union([DmarcPolicyValue, z.null()]).meta({
      description:
        "The policy receivers apply: the record's `p` (`none` when it has none), or for a " +
        "subdomain without a record of its own, its organizational domain's `sp` (else `p`).",
    }),
    inherited_from: z.union([z.string(), z.null()]).meta({
      description:
        "The organizational domain whose DMARC record applies, when this domain publishes none " +
        "of its own.",
    }),
    policy_since: z.union([z.iso.datetime(), z.null()]).meta({
      description: "When a DNS check first saw the current policy.",
    }),
    stage: z.enum(DMARC_STAGES).meta({
      description:
        "Where the domain is on the path to enforcement: `not_checked` (DNS not checked yet), " +
        "`no_record`, `monitoring` (`p=none`), `quarantine` or `reject`.",
    }),
    partial: z.boolean().meta({
      description: "The policy applies only partly (`pct` below 100, or `t=y`).",
    }),
    reporting: z
      .boolean()
      .meta({ description: "The published record sends aggregate reports to `report_address`." }),
    ready: z.boolean().meta({ description: "Whether `next` is safe to publish now." }),
    next: z
      .union([
        z.object({
          kind: z.enum(DMARC_NEXT_STEP_KINDS),
          policy: DmarcPolicyValue,
          record: z
            .string()
            .meta({ description: "The TXT record to publish at `_dmarc.<domain>`." }),
        }),
        z.null(),
      ])
      .meta({
        description:
          "The next step: `publish` a first record, `add_reporting` (send reports to coss.com), " +
          "`complete_rollout` (drop `pct`/`t=y`) or `tighten` to the next policy. `null` at " +
          "`p=reject`.",
      }),
    checks: z
      .array(
        z.object({
          id: z.enum(DMARC_CHECK_IDS),
          ok: z.boolean(),
          message: z.string(),
        }),
      )
      .meta({
        description: "The readiness checks gating `next`, from the last 14 days of reports.",
      }),
    warnings: z.array(z.string()),
    report_summary: z.object({
      period_start: z.iso.datetime(),
      period_end: z.iso.datetime(),
      reports: z.number().int(),
      messages: z.number().int(),
      passing: z.number().int(),
      coss_messages: z.number().int(),
      coss_passing: z.number().int(),
      first_report_at: z.union([z.iso.datetime(), z.null()]),
      last_report_at: z.union([z.iso.datetime(), z.null()]),
      sources: z
        .array(DmarcSource)
        .meta({ description: "The 50 sources with the most messages in the period." }),
    }),
  })
  .meta({ id: "DomainDmarc", examples: [DOMAIN_DMARC_EXAMPLE] });

export type DomainDmarcOutput = z.output<typeof DomainDmarc>;

const DMARC_POLICY_PUBLISHED_EXAMPLE = {
  domain: "acme.com",
  p: "none",
  sp: null,
  np: null,
  adkim: "r",
  aspf: "r",
  pct: 100,
  testing: null,
};

const DMARC_REPORT_SUMMARY_EXAMPLE = {
  object: "dmarc_report",
  id: DMARC_REPORT_ID_EXAMPLE,
  domain_id: DOMAIN_ID_EXAMPLE,
  reporter: { org_name: "google.com", email: "noreply-dmarc-support@google.com" },
  report_id: "13845021974128475",
  period_start: "2026-10-09T00:00:00.000Z",
  period_end: "2026-10-09T23:59:59.000Z",
  policy_published: DMARC_POLICY_PUBLISHED_EXAMPLE,
  messages: 1204,
  passing: 1200,
  truncated: false,
  received_at: "2026-10-10T03:12:44.000Z",
};

export const DmarcReportSummary = z
  .object({
    object: z.literal("dmarc_report"),
    id: z.string(),
    domain_id: z.string(),
    reporter: z.object({ org_name: z.string(), email: z.union([z.string(), z.null()]) }),
    report_id: z.string().meta({ description: "The reporter's own id of the report." }),
    period_start: z.iso.datetime(),
    period_end: z.iso.datetime(),
    policy_published: z
      .object({
        domain: z.string(),
        p: z.union([z.string(), z.null()]),
        sp: z.union([z.string(), z.null()]),
        np: z.union([z.string(), z.null()]),
        adkim: z.union([z.string(), z.null()]),
        aspf: z.union([z.string(), z.null()]),
        pct: z.union([z.number().int(), z.null()]),
        testing: z.union([z.string(), z.null()]),
      })
      .meta({ description: "The policy the reporter found when it evaluated the mail." }),
    messages: z.number().int(),
    passing: z.number().int(),
    truncated: z.boolean().meta({
      description:
        "The report listed more rows than are kept (10,000); totals cover the kept rows.",
    }),
    received_at: z.iso.datetime(),
  })
  .meta({ id: "DmarcReportSummary", examples: [DMARC_REPORT_SUMMARY_EXAMPLE] });

export type DmarcReportSummaryOutput = z.output<typeof DmarcReportSummary>;

const DMARC_RECORD_EXAMPLE = {
  source_ip: "54.240.8.12",
  count: 1200,
  disposition: "none",
  dkim: "pass",
  spf: "pass",
  dmarc_pass: true,
  header_from: "acme.com",
  envelope_from: "send.acme.com",
  via_coss: true,
  auth_results: {
    dkim: [{ domain: "acme.com", selector: "x7f3k2m9qp4ld8sv6hwz1nyc5rbtgj0e", result: "pass" }],
    spf: [{ domain: "send.acme.com", scope: "mfrom", result: "pass" }],
  },
  reasons: [],
};

export const DmarcReportRecord = z
  .object({
    source_ip: z.string(),
    count: z.number().int(),
    disposition: z
      .enum(DMARC_DISPOSITIONS)
      .meta({ description: "What the receiver did with the messages." }),
    dkim: z.enum(DMARC_ALIGNED_RESULTS).meta({ description: "Aligned DKIM result." }),
    spf: z.enum(DMARC_ALIGNED_RESULTS).meta({ description: "Aligned SPF result." }),
    dmarc_pass: z.boolean(),
    header_from: z.string(),
    envelope_from: z.union([z.string(), z.null()]),
    via_coss: z.boolean(),
    auth_results: z.object({
      dkim: z.array(
        z.object({
          domain: z.string(),
          selector: z.union([z.string(), z.null()]),
          result: z.string(),
        }),
      ),
      spf: z.array(
        z.object({
          domain: z.string(),
          scope: z.union([z.string(), z.null()]),
          result: z.string(),
        }),
      ),
    }),
    reasons: z.array(z.object({ type: z.string(), comment: z.union([z.string(), z.null()]) })),
  })
  .meta({ id: "DmarcReportRecord", examples: [DMARC_RECORD_EXAMPLE] });

export const DmarcReportObject = DmarcReportSummary.extend({
  records: z.array(DmarcReportRecord),
}).meta({
  id: "DmarcReport",
  examples: [{ ...DMARC_REPORT_SUMMARY_EXAMPLE, records: [DMARC_RECORD_EXAMPLE] }],
});

export type DmarcReportObjectOutput = z.output<typeof DmarcReportObject>;

export const DmarcReportList = z
  .object({
    object: z.literal("list"),
    data: z.array(DmarcReportSummary),
    has_more: z.boolean(),
  })
  .meta({
    id: "DmarcReportList",
    examples: [{ object: "list", data: [DMARC_REPORT_SUMMARY_EXAMPLE], has_more: false }],
  });

export type DmarcReportListOutput = z.output<typeof DmarcReportList>;

export const ListDmarcReportsQuery = z
  .strictObject({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_DMARC_REPORT_LIST_LIMIT)
      .optional()
      .meta({
        description: `1-${MAX_DMARC_REPORT_LIST_LIMIT}, default ${DEFAULT_DMARC_REPORT_LIST_LIMIT}.`,
      }),
    after: z
      .string()
      .max(64)
      .optional()
      .meta({ description: "Cursor: the `id` of the last report of the previous page." }),
  })
  .meta({ description: "Reports are returned newest first." });

export type ListDmarcReportsQueryOutput = z.output<typeof ListDmarcReportsQuery>;

/**
 * Body of a `domain.dmarc_report_received` webhook request: a summary of the report (never its
 * rows or source addresses; read those with the report's id).
 */
export const DomainWebhookEvent = z
  .object({
    id: z.string().meta({
      description: "The event id, and the `webhook-id` header.",
      examples: ["evt_01k7c8m4r0c2b8w9y3d5f6g7j1"],
    }),
    object: z.literal("event"),
    type: z.enum(DOMAIN_EVENT_TYPES),
    api_version: z.string().meta({
      description:
        "The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.",
      examples: [LATEST_API_VERSION],
    }),
    created_at: z.iso.datetime(),
    data: z.object({
      organization_id: z.string(),
      domain_id: z.string(),
      domain: z.string(),
      dmarc_report_id: z.string(),
      reporter: z.string().meta({ description: "The reporting organization (`org_name`)." }),
      period_start: z.iso.datetime(),
      period_end: z.iso.datetime(),
      messages: z.number().int(),
      passing: z.number().int(),
      occurred_at: z.iso.datetime(),
    }),
  })
  .meta({
    id: "DomainWebhookEvent",
    examples: [
      {
        id: "evt_01k7c8m4r0c2b8w9y3d5f6g7j1",
        object: "event",
        type: "domain.dmarc_report_received",
        api_version: LATEST_API_VERSION,
        created_at: "2026-10-10T03:12:45.000Z",
        data: {
          organization_id: "org_01k7c8m4q2f3e9v6t5r1n0p8yz",
          domain_id: DOMAIN_ID_EXAMPLE,
          domain: "acme.com",
          dmarc_report_id: DMARC_REPORT_ID_EXAMPLE,
          reporter: "google.com",
          period_start: "2026-10-09T00:00:00.000Z",
          period_end: "2026-10-09T23:59:59.000Z",
          messages: 1204,
          passing: 1200,
          occurred_at: "2026-10-10T03:12:44.000Z",
        },
      },
    ],
  });

export type DomainWebhookEventOutput = z.output<typeof DomainWebhookEvent>;
/** What the outbox stores: delivery adds `api_version` when it renders the event for an endpoint. */
export type StoredDomainWebhookEvent = Omit<DomainWebhookEventOutput, "api_version">;
