/**
 * Public wire schemas for Sign (snake_case). Plain zod with `.meta({ id })`, shared by the public
 * API, its OpenAPI document and the contract tests. Must not import the database (or
 * `@coss/email`): `@coss/sign/schemas` is safe to load anywhere.
 */
import { LATEST_API_VERSION } from "@coss/versioning";
import { z } from "zod";

export const SIGN_REQUEST_STATUSES = [
  "draft",
  "sent",
  "completed",
  "declined",
  "canceled",
  "expired",
] as const;
export type SignRequestStatus = (typeof SIGN_REQUEST_STATUSES)[number];

export const SIGN_SIGNER_STATUSES = [
  "pending",
  "notified",
  "viewed",
  "signed",
  "declined",
] as const;
export type SignSignerStatus = (typeof SIGN_SIGNER_STATUSES)[number];

export const SIGN_DELIVERIES = ["embedded", "email"] as const;
export type SignDelivery = (typeof SIGN_DELIVERIES)[number];

export const SIGN_AUTHENTICATIONS = ["email_link", "customer_asserted"] as const;
export type SignAuthentication = (typeof SIGN_AUTHENTICATIONS)[number];

export const SIGN_SIGNING_ORDERS = ["parallel", "sequential"] as const;

export const SIGN_FIELD_TYPES = [
  "signature",
  "initials",
  "date_signed",
  "name",
  "email",
  "text",
  "checkbox",
] as const;
export type SignFieldType = (typeof SIGN_FIELD_TYPES)[number];

export const SIGN_EVENT_TYPES = [
  "created",
  "sent",
  "notified",
  "viewed",
  "consented",
  "signed",
  "declined",
  "reminded",
  "canceled",
  "expired",
  "completed",
  "sealed",
] as const;
export type SignEventType = (typeof SIGN_EVENT_TYPES)[number];

export const SIGN_EVENT_ACTORS = ["api_key", "signer", "dashboard", "system"] as const;
export type SignEventActor = (typeof SIGN_EVENT_ACTORS)[number];

export const MAX_SIGN_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_SIGN_DOCUMENT_PAGES = 500;
export const MAX_SIGN_REQUEST_DOCUMENTS = 10;
export const MAX_SIGN_SIGNERS = 20;
export const MAX_SIGN_FIELDS = 500;
export const MAX_SIGN_METADATA_KEYS = 20;
export const MAX_SIGN_EXPIRY_DAYS = 365;
export const DEFAULT_SIGN_LIST_LIMIT = 20;
/** Automatic reminders per email signer (asked-for ones aren't counted). */
export const MAX_SIGN_REMINDERS = 3;
export const MAX_SIGN_REMINDER_INTERVAL_DAYS = 30;
export const MAX_SIGN_LIST_LIMIT = 100;

/**
 * Text anchors: `{{<field type>:<key>}}`, e.g. `{{signature:signer_1}}`. A field given by
 * `anchor` is placed over every occurrence of that text in the request's documents.
 */
export const SIGN_ANCHOR_PATTERN = /\{\{[a-z_]+:[A-Za-z0-9_-]{1,64}\}\}/g;

const DOCUMENT_ID_EXAMPLE = "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz";
const REQUEST_ID_EXAMPLE = "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz";
const SIGNER_ID_EXAMPLE = "ssgn_01k7c8m4q2f3e9v6t5r1n0p8yz";
const FIELD_ID_EXAMPLE = "sfld_01k7c8m4q2f3e9v6t5r1n0p8yz";
const EVENT_ID_EXAMPLE = "sevt_01k7c8m4q2f3e9v6t5r1n0p8yz";
const SHA256_EXAMPLE = "9f2c6c0f0e1d4b7a8c5e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c";
const CREATED_AT_EXAMPLE = "2026-10-26T15:04:05.000Z";
// A one-page Letter PDF reading "Signature: {{signature:signer_1}}", base64-encoded (the API
// reference's samples and playground send it).
export const SIGN_EXAMPLE_PDF =
  "JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNCAwIFIgXQovQ291bnQgMQo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovVHlwZSAvRm9udAovU3VidHlwZSAvVHlwZTEKL0Jhc2VGb250IC9IZWx2ZXRpY2EKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMSAwIFIKL1Jlc291cmNlcyA8PAovRm9udCA8PAovSGVsdmV0aWNhLTcwOTg0ODA3ODkgMyAwIFIKPj4KL1hPYmplY3QgPDwKPj4KL0V4dEdTdGF0ZSA8PAo+Pgo+PgovTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdCi9Bbm5vdHMgWyBdCi9Db250ZW50cyBbIDUgMCBSIF0KPj4KZW5kb2JqCgo1IDAgb2JqCjw8Ci9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9MZW5ndGggMTIwCj4+CnN0cmVhbQp4nG2KMQrCQBBF+znF1II4O7s7fxckYEjEwkaYC4hEiWgREc9vtLCSV/3330Stk/CHx4VWu+H2Gp7j6biE1JKKoFQOyn4mTex7Ct80MJQhwn6ndY5WDdZbQEKGWo4bFbQzf56fm3fexoAOXcN+JV9Q73SgN3RWIBIKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE2IDAwMDAwIG4gCjAwMDAwMDAwNzYgMDAwMDAgbiAKMDAwMDAwMDEyNiAwMDAwMCBuIAowMDAwMDAwMjI0IDAwMDAwIG4gCjAwMDAwMDA0MTkgMDAwMDAgbiAKCnRyYWlsZXIKPDwKL1NpemUgNgovUm9vdCAyIDAgUgo+PgoKc3RhcnR4cmVmCjYxMgolJUVPRg==";

/**
 * Canonical base64: padded, no whitespace or data: URL prefix. A plain scan, because regex
 * engines give up on multi-megabyte strings (the same rule as email attachments).
 */
export function isCanonicalBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  for (let i = 0; i < value.length - padding; i++) {
    const c = value.charCodeAt(i);
    const valid =
      (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47;
    if (!valid) return false;
  }
  return true;
}

/** Decoded size of canonical base64, without decoding it. */
export function base64DecodedSize(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

const CONTROL_CHARACTER = /\p{Cc}/u;

const Filename = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !CONTROL_CHARACTER.test(value) && !/[/\\]/.test(value), {
    message: "Must not contain control characters or slashes.",
  })
  .refine((value) => value.toLowerCase().endsWith(".pdf"), { message: "Must end in .pdf." })
  .meta({ description: "The file's name, ending in `.pdf`.", examples: ["agreement.pdf"] });

const PdfContent = z
  .string()
  .min(1)
  .refine(isCanonicalBase64, "Must be base64-encoded (no whitespace or data: prefix).")
  .refine(
    (value) => base64DecodedSize(value) <= MAX_SIGN_DOCUMENT_BYTES,
    `Must be at most ${MAX_SIGN_DOCUMENT_BYTES / (1024 * 1024)} MB once decoded.`,
  )
  .meta({ description: "The PDF's bytes, base64-encoded (at most 25 MB decoded)." });

export const UploadSignDocumentRequest = z
  .strictObject({ filename: Filename, content: PdfContent })
  .meta({
    id: "UploadSignDocumentRequest",
    examples: [{ filename: "agreement.pdf", content: SIGN_EXAMPLE_PDF }],
  });

export type UploadSignDocumentRequestOutput = z.output<typeof UploadSignDocumentRequest>;

const PageSize = z.object({
  width: z.number().meta({ description: "In PDF points (1/72 inch)." }),
  height: z.number().meta({ description: "In PDF points (1/72 inch)." }),
});

const Anchor = z
  .object({
    text: z.string().meta({
      description: "The anchor as it appears in the document.",
      examples: ["{{signature:signer_1}}"],
    }),
    page: z.number().int().meta({ description: "1-based page number." }),
    x: z.number().meta({ description: "Left edge, in PDF points from the page's left." }),
    y: z.number().meta({ description: "Top edge, in PDF points from the page's top." }),
    width: z.number().meta({ description: "In PDF points." }),
    height: z.number().meta({ description: "In PDF points." }),
  })
  .meta({
    description: "A text anchor found in the document, in points from the page's top left.",
  });

export const SignDocumentObject = z
  .object({
    object: z.literal("sign_document"),
    id: z.string().meta({ examples: [DOCUMENT_ID_EXAMPLE] }),
    filename: z.string().meta({ description: "The file's name, as uploaded." }),
    size: z.number().int().meta({ description: "Bytes." }),
    sha256: z.string().meta({ description: "Hex SHA-256 of the uploaded bytes." }),
    page_count: z.number().int().meta({ description: "How many pages it has." }),
    pages: z.array(PageSize).meta({ description: "Each page's size, in order." }),
    anchors: z.array(Anchor).meta({
      description:
        "Text anchors (`{{signature:signer_1}}`) found in the document, which fields can be placed by.",
    }),
    sandbox: z.boolean().meta({ description: "Whether it belongs to a sandbox environment." }),
    created_at: z.iso.datetime(),
  })
  .meta({
    id: "SignDocument",
    examples: [
      {
        object: "sign_document",
        id: DOCUMENT_ID_EXAMPLE,
        filename: "agreement.pdf",
        size: 48213,
        sha256: SHA256_EXAMPLE,
        page_count: 2,
        pages: [
          { width: 612, height: 792 },
          { width: 612, height: 792 },
        ],
        anchors: [
          { text: "{{signature:signer_1}}", page: 2, x: 72, y: 640, width: 140, height: 12 },
        ],
        sandbox: false,
        created_at: CREATED_AT_EXAMPLE,
      },
    ],
  });

export type SignDocumentObjectOutput = z.output<typeof SignDocumentObject>;

export const SignDocumentList = z
  .object({ object: z.literal("list"), data: z.array(SignDocumentObject), has_more: z.boolean() })
  .meta({ id: "SignDocumentList", examples: [{ object: "list", data: [], has_more: false }] });

export const DeletedSignDocument = z
  .object({ object: z.literal("sign_document"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedSignDocument",
    examples: [{ object: "sign_document", id: DOCUMENT_ID_EXAMPLE, deleted: true }],
  });

const Coordinate = z.number().finite().min(0);
const Size = z.number().finite().positive();

const FieldBase = {
  type: z.enum(SIGN_FIELD_TYPES).meta({
    description:
      "`signature` and `initials` take the signer's adopted signature, `date_signed` is filled with the signing date, `name` and `email` with the signer's, `text` and `checkbox` by the signer.",
  }),
  required: z
    .boolean()
    .optional()
    .meta({ description: "Default `true`. A signer can't finish with a required field empty." }),
  label: z.string().min(1).max(100).optional().meta({ description: "Shown to the signer." }),
};

const PlacedField = z.strictObject({
  ...FieldBase,
  document: z
    .number()
    .int()
    .min(0)
    .optional()
    .meta({ description: "Index of the document in `documents` (default 0)." }),
  page: z.number().int().min(1).meta({ description: "1-based page number." }),
  x: Coordinate.meta({ description: "Left edge, in PDF points from the page's left." }),
  y: Coordinate.meta({ description: "Top edge, in PDF points from the page's top." }),
  width: Size.meta({ description: "In PDF points." }),
  height: Size.meta({ description: "In PDF points." }),
});

const AnchoredField = z.strictObject({
  ...FieldBase,
  anchor: z
    .string()
    .regex(
      /^\{\{[a-z_]+:[A-Za-z0-9_-]{1,64}\}\}$/,
      "Expected an anchor like {{signature:signer_1}}.",
    )
    .meta({
      description:
        "Place the field over every occurrence of this text in the documents (e.g. `{{signature:signer_1}}`).",
    }),
  width: Size.optional().meta({ description: "Default: the anchor text's width." }),
  height: Size.optional().meta({ description: "Default: the anchor text's height." }),
  offset_x: z.number().finite().optional().meta({ description: "Points to move it right." }),
  offset_y: z.number().finite().optional().meta({ description: "Points to move it down." }),
});

export const SignFieldInput = z.union([PlacedField, AnchoredField]).meta({ id: "SignFieldInput" });
export type SignFieldInputOutput = z.output<typeof SignFieldInput>;

const SignerInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .meta({ description: "Shown on the signing page and in the audit trail." }),
  email: z.email().max(254).meta({
    description: "Where a `delivery: email` signer gets their link. Unique within a request.",
  }),
  delivery: z.enum(SIGN_DELIVERIES).optional().meta({
    description:
      "`email` (default): coss.com emails the signer a link. `embedded`: your app shows the signing page (create a session) and vouches for who the signer is.",
  }),
  order: z.number().int().min(1).max(MAX_SIGN_SIGNERS).optional().meta({
    description:
      'With `signing_order: "sequential"`, signers sign in increasing `order` (default: their position in `signers`).',
  }),
  client_ref: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .meta({ description: "Your own id for the signer, recorded in the audit trail." }),
  fields: z.array(SignFieldInput).max(MAX_SIGN_FIELDS).meta({
    description: "What this signer fills. Every signer needs at least one `signature` field.",
  }),
});

const DocumentInput = z.union([
  z.strictObject({
    document_id: z
      .string()
      .meta({ description: "An uploaded document.", examples: [DOCUMENT_ID_EXAMPLE] }),
  }),
  z.strictObject({ filename: Filename, content: PdfContent }),
]);

const Metadata = z
  .record(z.string().min(1).max(40), z.string().max(500))
  .refine((value) => Object.keys(value).length <= MAX_SIGN_METADATA_KEYS, {
    message: `At most ${MAX_SIGN_METADATA_KEYS} keys.`,
  })
  .meta({ description: "Your own key-value pairs, returned with the request and its webhooks." });

export const CreateSignRequestRequest = z
  .strictObject({
    title: z.string().trim().min(1).max(200).meta({ description: "Shown to signers." }),
    message: z.string().max(2000).optional().meta({ description: "A note to signers." }),
    documents: z
      .array(DocumentInput)
      .min(1)
      .max(MAX_SIGN_REQUEST_DOCUMENTS)
      .meta({ description: "Uploaded documents by id, or PDFs inline (base64)." }),
    signers: z
      .array(SignerInput)
      .min(1)
      .max(MAX_SIGN_SIGNERS)
      .meta({ description: "Who signs, and what each fills." }),
    signing_order: z.enum(SIGN_SIGNING_ORDERS).optional().meta({
      description:
        "`parallel` (default): everyone at once. `sequential`: in each signer's `order`.",
    }),
    expires_at: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({
        description: `When unsigned requests expire (at most ${MAX_SIGN_EXPIRY_DAYS} days ahead).`,
      }),
    metadata: Metadata.optional(),
    reminder_interval_days: z
      .number()
      .int()
      .min(1)
      .max(MAX_SIGN_REMINDER_INTERVAL_DAYS)
      .nullable()
      .optional()
      .meta({
        description: `Email signers who haven't signed get a reminder every this many days (up to ${MAX_SIGN_REMINDERS}). Default: your Sign settings' \`reminder_interval_days\`; \`null\`: none.`,
      }),
    send: z.boolean().optional().meta({
      description: "Default `true`: send at once. `false` keeps a `draft` to send later.",
    }),
  })
  .meta({
    id: "CreateSignRequestRequest",
    examples: [
      {
        title: "Services agreement",
        documents: [{ document_id: DOCUMENT_ID_EXAMPLE }],
        signers: [
          {
            name: "Ada Lovelace",
            email: "ada@example.com",
            fields: [
              { type: "signature", anchor: "{{signature:signer_1}}" },
              { type: "date_signed", page: 2, x: 320, y: 640, width: 120, height: 18 },
            ],
          },
        ],
      },
    ],
  });

export type CreateSignRequestRequestOutput = z.output<typeof CreateSignRequestRequest>;

const RequestDocument = z.object({
  id: z.string().meta({ examples: [DOCUMENT_ID_EXAMPLE] }),
  filename: z.string().meta({ description: "The file's name." }),
  sha256: z.string().meta({ description: "Hex SHA-256 of the uploaded bytes." }),
  page_count: z.number().int().meta({ description: "How many pages it has." }),
});

export const SignSignerObject = z
  .object({
    object: z.literal("sign_signer"),
    id: z.string().meta({ examples: [SIGNER_ID_EXAMPLE] }),
    name: z.string(),
    email: z.string(),
    order: z
      .number()
      .int()
      .meta({ description: "Where they come in `signing_order: sequential`. Lower signs first." }),
    delivery: z.enum(SIGN_DELIVERIES).meta({
      description:
        "`email`: coss.com emails them a link. `embedded`: your app shows the signing page.",
    }),
    authentication: z.enum(SIGN_AUTHENTICATIONS).meta({
      description:
        "How the signer is identified: `email_link` (they opened the link coss.com emailed) or `customer_asserted` (your app vouched for them).",
    }),
    status: z.enum(SIGN_SIGNER_STATUSES).meta({
      description:
        "`pending`: not contacted yet. `notified`: emailed their link. `viewed`: opened the signing page. `signed`: done. `declined`: refused, which declines the whole request.",
    }),
    client_ref: z
      .string()
      .nullable()
      .meta({ description: "Your own id for the signer. `null`: none given." }),
    viewed_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When they first opened the signing page. `null`: not yet." }),
    signed_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When they signed. `null`: not yet." }),
    declined_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When they declined. `null`: they haven't." }),
    decline_reason: z
      .string()
      .nullable()
      .meta({ description: "The reason they gave. `null`: none given." }),
  })
  .meta({ description: "Someone asked to sign.", id: "SignSigner" });

export const SignFieldObject = z
  .object({
    object: z.literal("sign_field"),
    id: z.string().meta({ examples: [FIELD_ID_EXAMPLE] }),
    signer_id: z.string().meta({ description: "The id of the signer who fills it." }),
    document_id: z.string().meta({ description: "The id of the document it's on." }),
    type: z.enum(SIGN_FIELD_TYPES).meta({
      description:
        "`signature` and `initials` take the signer's adopted signature, `date_signed` is filled with the signing date, `name` and `email` with the signer's, `text` and `checkbox` by the signer.",
    }),
    page: z.number().int().meta({ description: "1-based page number." }),
    x: z.number().meta({ description: "Left edge, in PDF points from the page's left." }),
    y: z.number().meta({ description: "Top edge, in PDF points from the page's top." }),
    width: z.number().meta({ description: "In PDF points." }),
    height: z.number().meta({ description: "In PDF points." }),
    required: z.boolean().meta({ description: "Whether a signer can finish with it empty." }),
    label: z.string().nullable().meta({ description: "Shown to the signer. `null`: none." }),
    anchor: z
      .string()
      .nullable()
      .meta({ description: "The text anchor it was placed by. `null`: placed by position." }),
  })
  .meta({ description: "A box on a page that one signer fills.", id: "SignField" });

export const SignRequestObject = z
  .object({
    object: z.literal("sign_request"),
    id: z.string().meta({ examples: [REQUEST_ID_EXAMPLE] }),
    status: z.enum(SIGN_REQUEST_STATUSES).meta({
      description:
        "`draft` until sent, `sent` while signers sign, then `completed` (everyone signed), `declined` (a signer declined), `canceled` or `expired`.",
    }),
    title: z.string().meta({ description: "Shown to signers." }),
    message: z.string().nullable().meta({ description: "A note to signers. `null`: none." }),
    signing_order: z.enum(SIGN_SIGNING_ORDERS).meta({
      description: "`parallel`: everyone at once. `sequential`: in each signer's `order`.",
    }),
    documents: z.array(RequestDocument).meta({ description: "The documents to sign, in order." }),
    signers: z.array(SignSignerObject).meta({ description: "Who signs." }),
    fields: z.array(SignFieldObject).meta({ description: "What each signer fills." }),
    metadata: z.record(z.string(), z.string()).meta({ description: "Your own key-value pairs." }),
    sandbox: z.boolean().meta({ description: "Whether it belongs to a sandbox environment." }),
    reminder_interval_days: z.number().int().nullable().meta({
      description: "Days between automatic reminders to email signers; `null`: none.",
    }),
    expires_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it expires if it isn't finished. `null`: never." }),
    expired_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it expired. `null`: it hasn't." }),
    sent_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it was sent. `null`: still a draft." }),
    completed_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When the last signer signed. `null`: not yet." }),
    canceled_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it was canceled. `null`: it wasn't." }),
    declined_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When a signer declined it. `null`: nobody has." }),
    // A union, not `.nullable()`: that loses the `null` in the OpenAPI document.
    signed_document: z
      .union([
        z.object({
          sha256: z.string().meta({ description: "Hex SHA-256 of the sealed PDF." }),
          sealed_at: z.iso.datetime().meta({ description: "When it was sealed." }),
        }),
        z.null(),
      ])
      .meta({
        description:
          "The completed document, sealed by coss.com: every document with the signatures and values filled in, and a certificate of completion. `null` until it is ready (shortly after `completed`, announced by the `sign_request.completed` webhook); download it from `GET /v1/sign/requests/{id}/signed_document`.",
      }),
    created_at: z.iso.datetime(),
  })
  .meta({
    id: "SignRequest",
    examples: [
      {
        object: "sign_request",
        id: REQUEST_ID_EXAMPLE,
        status: "sent",
        title: "Services agreement",
        message: null,
        signing_order: "parallel",
        documents: [
          {
            id: DOCUMENT_ID_EXAMPLE,
            filename: "agreement.pdf",
            sha256: SHA256_EXAMPLE,
            page_count: 2,
          },
        ],
        signers: [
          {
            object: "sign_signer",
            id: SIGNER_ID_EXAMPLE,
            name: "Ada Lovelace",
            email: "ada@example.com",
            order: 1,
            delivery: "email",
            authentication: "email_link",
            status: "pending",
            client_ref: null,
            viewed_at: null,
            signed_at: null,
            declined_at: null,
            decline_reason: null,
          },
        ],
        fields: [
          {
            object: "sign_field",
            id: FIELD_ID_EXAMPLE,
            signer_id: SIGNER_ID_EXAMPLE,
            document_id: DOCUMENT_ID_EXAMPLE,
            type: "signature",
            page: 2,
            x: 72,
            y: 640,
            width: 140,
            height: 12,
            required: true,
            label: null,
            anchor: "{{signature:signer_1}}",
          },
        ],
        metadata: {},
        sandbox: false,
        reminder_interval_days: 3,
        expires_at: null,
        expired_at: null,
        sent_at: CREATED_AT_EXAMPLE,
        completed_at: null,
        canceled_at: null,
        declined_at: null,
        signed_document: null,
        created_at: CREATED_AT_EXAMPLE,
      },
    ],
  });

export type SignRequestObjectOutput = z.output<typeof SignRequestObject>;

export const DeletedSignRequest = z
  .object({ object: z.literal("sign_request"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedSignRequest",
    examples: [{ object: "sign_request", id: REQUEST_ID_EXAMPLE, deleted: true }],
  });

export const SignRequestList = z
  .object({ object: z.literal("list"), data: z.array(SignRequestObject), has_more: z.boolean() })
  .meta({ id: "SignRequestList", examples: [{ object: "list", data: [], has_more: false }] });

const ListLimit = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_SIGN_LIST_LIMIT)
  .optional()
  .meta({ description: `1-${MAX_SIGN_LIST_LIMIT}, default ${DEFAULT_SIGN_LIST_LIMIT}.` });

const After = z
  .string()
  .max(64)
  .optional()
  .meta({ description: "Cursor: the `id` of the last item of the previous page." });

export const ListSignDocumentsQuery = z
  .strictObject({ limit: ListLimit, after: After })
  .meta({ description: "Documents are returned newest first." });

export const ListSignRequestsQuery = z
  .strictObject({
    status: z
      .string()
      .transform((value, ctx) => {
        const out: SignRequestStatus[] = [];
        for (const part of value.split(",").map((piece) => piece.trim())) {
          if (part.length === 0) continue;
          const parsed = z.enum(SIGN_REQUEST_STATUSES).safeParse(part);
          if (!parsed.success) {
            ctx.addIssue({ code: "custom", message: `Invalid value "${part}".` });
            return z.NEVER;
          }
          out.push(parsed.data);
        }
        return out;
      })
      .optional()
      .meta({ description: "Only requests in these statuses, comma-separated: `sent,draft`." }),
    limit: ListLimit,
    after: After,
  })
  .meta({ description: "Requests are returned newest first." });

export type ListSignRequestsQueryOutput = z.output<typeof ListSignRequestsQuery>;

export const SignEventObject = z
  .object({
    object: z.literal("sign_event"),
    id: z.string().meta({ examples: [EVENT_ID_EXAMPLE] }),
    sequence: z.number().int().meta({ description: "1-based position in the request's trail." }),
    type: z.enum(SIGN_EVENT_TYPES).meta({
      description:
        "What happened. `created`, `sent`, `canceled`, `expired` and `reminded` concern the request; `notified`, `viewed`, `consented`, `signed` and `declined` a signer; `completed` is the last signature and `sealed` the sealed document being ready.",
    }),
    signer_id: z
      .string()
      .nullable()
      .meta({ description: "The id of the signer it concerns. `null`: the whole request." }),
    actor: z.enum(SIGN_EVENT_ACTORS).meta({
      description: "Who did it: your API key, a signer, a member in the dashboard, or coss.com.",
    }),
    ip_address: z.string().nullable().meta({
      description: "The address the action came from. `null`: unknown, or coss.com acted.",
    }),
    user_agent: z
      .string()
      .nullable()
      .meta({ description: "The client's `User-Agent`. `null`: unknown." }),
    details: z
      .object({
        reason: z.string().optional().meta({ description: "`declined`: the signer's reason." }),
        document_sha256: z.record(z.string(), z.string()).optional().meta({
          description: "Each document's SHA-256 at that moment, by document id.",
        }),
        disclosure_sha256: z.string().optional().meta({
          description: "SHA-256 of the consent text the signer accepted.",
        }),
        field_ids: z
          .array(z.string())
          .optional()
          .meta({ description: "`signed`: the fields the signer filled." }),
        signature_sha256: z.string().optional().meta({
          description: "SHA-256 of the signature image the signer adopted.",
        }),
        initials_sha256: z
          .string()
          .optional()
          .meta({ description: "SHA-256 of the initials image the signer adopted." }),
        session_id: z.string().optional().meta({
          description: "The signing session the signer used.",
        }),
        signed_document_sha256: z.string().optional().meta({
          description: "`sealed`: the SHA-256 of the sealed, completed document.",
        }),
      })
      .meta({ description: "What this event recorded, depending on its type." }),
    occurred_at: z.iso.datetime().meta({ description: "When it happened." }),
    previous_hash: z
      .string()
      .nullable()
      .meta({ description: "The previous event's `hash`. `null` on the first event." }),
    hash: z.string().meta({
      description:
        "SHA-256 over this event and `previous_hash`: changing or removing an event breaks the chain from there on.",
    }),
  })
  .meta({
    id: "SignEvent",
    examples: [
      {
        object: "sign_event",
        id: EVENT_ID_EXAMPLE,
        sequence: 1,
        type: "created",
        signer_id: null,
        actor: "api_key",
        ip_address: "203.0.113.7",
        user_agent: null,
        details: { document_sha256: { [DOCUMENT_ID_EXAMPLE]: SHA256_EXAMPLE } },
        occurred_at: CREATED_AT_EXAMPLE,
        previous_hash: null,
        hash: SHA256_EXAMPLE,
      },
    ],
  });

export type SignEventObjectOutput = z.output<typeof SignEventObject>;

export const SignEventList = z
  .object({ object: z.literal("list"), data: z.array(SignEventObject), has_more: z.boolean() })
  .meta({ id: "SignEventList", examples: [{ object: "list", data: [], has_more: false }] });

// Signing sessions.

export const DEFAULT_SIGN_SESSION_EXPIRES_IN = 60 * 60;
export const MAX_SIGN_SESSION_EXPIRES_IN = 24 * 60 * 60;
export const MAX_SIGN_ORIGINS = 10;
export const SIGN_THEMES = ["system", "light", "dark"] as const;
export type SignTheme = (typeof SIGN_THEMES)[number];

const SESSION_ID_EXAMPLE = "sgs_01k7c8m4q2f3e9v6t5r1n0p8yz";

export const CreateSignSessionRequest = z
  .strictObject({
    expires_in: z
      .number()
      .int()
      .min(60)
      .max(MAX_SIGN_SESSION_EXPIRES_IN)
      .optional()
      .meta({
        description: `Seconds until the link expires: default ${DEFAULT_SIGN_SESSION_EXPIRES_IN}, at most ${MAX_SIGN_SESSION_EXPIRES_IN}. Mint one when your user opens the page that shows it.`,
      }),
  })
  .meta({ id: "CreateSignSessionRequest", examples: [{ expires_in: 3600 }] });
export type CreateSignSessionRequestOutput = z.output<typeof CreateSignSessionRequest>;

export const SignSessionObject = z
  .object({
    object: z.literal("sign_session"),
    id: z.string().meta({ examples: [SESSION_ID_EXAMPLE] }),
    request_id: z.string().meta({ description: "The signature request's id." }),
    signer_id: z.string().meta({ description: "The signer's id." }),
    url: z.string().meta({
      description:
        "The signing page: embed it in an iframe (from an allowed origin, with `coss/sign`'s `mountSigning`) or redirect to it. The token is in the URL fragment, so it never reaches a server log: show it only to that signer.",
    }),
    token: z.string().meta({ description: "The secret part of `url`, shown only here." }),
    expires_at: z.iso.datetime().meta({ description: "When the link stops working." }),
  })
  .meta({
    id: "SignSession",
    examples: [
      {
        object: "sign_session",
        id: SESSION_ID_EXAMPLE,
        request_id: REQUEST_ID_EXAMPLE,
        signer_id: SIGNER_ID_EXAMPLE,
        url: `https://sign.example/s/${SESSION_ID_EXAMPLE}#cosss_…`,
        token: "cosss_…",
        expires_at: CREATED_AT_EXAMPLE,
      },
    ],
  });
export type SignSessionObjectOutput = z.output<typeof SignSessionObject>;

// Settings.

/**
 * What signers agree to before they see a document: the consumer disclosure ESIGN asks for
 * (electronic records, a paper copy, withdrawing consent, what they need to open the records).
 * `{name}` is the requester's display name. An environment may replace it with its own text.
 */
export const DEFAULT_SIGN_DISCLOSURE = `{name} asks you to review and sign documents electronically.

Before you continue, please read the following:

1. Electronic records and signatures. By agreeing, you consent to receive the documents, notices and disclosures of this transaction electronically, and to sign them with an electronic signature, which has the same legal effect as your handwritten signature.

2. Paper copies. You may ask {name} for a paper copy of any document. After everyone has signed, you can download a copy of the signed documents.

3. Withdrawing consent. You may withdraw this consent at any time before you sign by declining to sign. Withdrawing doesn't affect anything you signed before.

4. What you need. A device with a current web browser and an internet connection, and a way to save or print PDF files.

5. Scope. This consent applies to this signature request only.`;

const Origins = z.array(z.string().max(255)).max(MAX_SIGN_ORIGINS);
const DisplayName = z.string().max(64);
const AccentColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A color like #2563eb.");
const Disclosure = z.string().min(1).max(10_000);

export const SignSettingsObject = z
  .object({
    object: z.literal("sign_settings"),
    allowed_origins: z.array(z.string()).meta({
      description:
        "Origins that may embed the signing page in an iframe, like `https://app.example.com` (sandbox environments also `http://localhost:<port>`). Empty: it can only be opened on its own.",
    }),
    display_name: z.string().nullable().meta({
      description: "The requester's name signers see. `null`: the organization's name.",
    }),
    accent_color: z
      .string()
      .nullable()
      .meta({ description: "The signing page's accent color, as `#RRGGBB`. `null`: the default." }),
    theme: z
      .enum(SIGN_THEMES)
      .meta({ description: "The signing page's theme. `system` follows the signer's device." }),
    disclosure: z.string().nullable().meta({
      description:
        "Your own consent text signers accept before they see a document. `null`: coss.com's default, which covers ESIGN's consumer disclosure. Have your counsel review a replacement.",
    }),
    email_from: z.string().nullable().meta({
      description:
        'Signing emails (invitations, reminders, signed copies) come from this address, on a verified domain in live environments. `null`: from coss.com, as "<display name> via coss.com".',
    }),
    reminder_interval_days: z.number().int().nullable().meta({
      description: "The default days between reminders for new requests; `null`: none.",
    }),
  })
  .meta({
    id: "SignSettings",
    examples: [
      {
        object: "sign_settings",
        allowed_origins: ["https://app.example.com"],
        display_name: "Acme",
        accent_color: "#2563eb",
        theme: "system",
        disclosure: null,
        email_from: "contracts@acme.com",
        reminder_interval_days: 3,
      },
    ],
  });
export type SignSettingsObjectOutput = z.output<typeof SignSettingsObject>;

export const UpdateSignSettingsRequest = z
  .strictObject({
    allowed_origins: Origins.optional().meta({
      description:
        "Origins that may embed the signing page in an iframe, like `https://app.example.com` (sandbox environments also `http://localhost:<port>`). Empty: it can only be opened on its own.",
    }),
    display_name: DisplayName.nullable()
      .optional()
      .meta({ description: "The requester's name signers see. `null`: the organization's name." }),
    accent_color: AccentColor.nullable()
      .optional()
      .meta({ description: "The signing page's accent color, as `#RRGGBB`. `null`: the default." }),
    theme: z
      .enum(SIGN_THEMES)
      .optional()
      .meta({ description: "The signing page's theme. `system` follows the signer's device." }),
    disclosure: Disclosure.nullable().optional().meta({
      description:
        "Your own consent text signers accept before they see a document. `null`: coss.com's default. Have your counsel review a replacement.",
    }),
    email_from: z.email().max(254).nullable().optional().meta({
      description:
        'Signing emails come from this address, on a verified domain in live environments. `null`: from coss.com, as "<display name> via coss.com".',
    }),
    reminder_interval_days: z
      .number()
      .int()
      .min(1)
      .max(MAX_SIGN_REMINDER_INTERVAL_DAYS)
      .nullable()
      .optional()
      .meta({ description: "The default days between reminders for new requests. `null`: none." }),
  })
  .meta({
    id: "UpdateSignSettingsRequest",
    description: "Only the fields given change.",
    examples: [{ allowed_origins: ["https://app.example.com"], display_name: "Acme" }],
  });
export type UpdateSignSettingsRequestOutput = z.output<typeof UpdateSignSettingsRequest>;

// Webhook events.

/** `sign_request.*` webhook events, one per audit trail event of these types. */
export const SIGN_WEBHOOK_EVENT_TYPES = [
  "sign_request.sent",
  "sign_request.viewed",
  "sign_request.signer_signed",
  "sign_request.declined",
  "sign_request.completed",
  "sign_request.canceled",
  "sign_request.expired",
] as const;
export type SignWebhookEventType = (typeof SIGN_WEBHOOK_EVENT_TYPES)[number];

/** The webhook event of each audit trail event that has one. */
export const SIGN_WEBHOOK_EVENT_OF: Partial<Record<SignEventType, SignWebhookEventType>> = {
  sent: "sign_request.sent",
  viewed: "sign_request.viewed",
  signed: "sign_request.signer_signed",
  declined: "sign_request.declined",
  // When the sealed document is ready, not at the last signature: then it can be downloaded.
  sealed: "sign_request.completed",
  canceled: "sign_request.canceled",
  expired: "sign_request.expired",
};

const ApiVersion = z.string().meta({
  description: "The API version the payload is rendered in (your endpoint's version).",
  examples: [LATEST_API_VERSION],
});

export const SignRequestWebhookEvent = z
  .object({
    id: z
      .string()
      .meta({ description: "The event id: the same as the audit trail's `SignEvent.id`." }),
    object: z.literal("event"),
    type: z.enum(SIGN_WEBHOOK_EVENT_TYPES).meta({
      description:
        "`sent`: sent to signers. `viewed`: a signer opened it. `signer_signed`: a signer signed. `declined`: a signer declined. `completed`: the sealed document is ready to download. `canceled` and `expired`: it ended unsigned.",
    }),
    api_version: ApiVersion,
    created_at: z.iso.datetime().meta({ description: "When the event was created." }),
    data: z
      .object({
        sign_request_id: z.string().meta({ description: "The signature request's id." }),
        status: z
          .enum(SIGN_REQUEST_STATUSES)
          .meta({ description: "The request's status after the event." }),
        title: z.string().meta({ description: "The request's title." }),
        metadata: z
          .record(z.string(), z.string())
          .meta({ description: "Your own key-value pairs." }),
        signer: z
          .object({
            id: z.string().meta({ description: "The signer's id." }),
            name: z.string().meta({ description: "The signer's name." }),
            email: z.string().meta({ description: "The signer's email address." }),
            client_ref: z
              .string()
              .nullable()
              .meta({ description: "Your own id for the signer. `null`: none given." }),
            status: z
              .enum(SIGN_SIGNER_STATUSES)
              .meta({ description: "The signer's status after the event." }),
          })
          .nullable()
          .meta({ description: "The signer who viewed, signed or declined; `null` otherwise." }),
        reason: z
          .string()
          .nullable()
          .meta({ description: "A decline's reason, if the signer gave one." }),
        sandbox: z.boolean().meta({ description: "Whether it belongs to a sandbox environment." }),
        occurred_at: z.iso.datetime().meta({ description: "When it happened." }),
      })
      .meta({ description: "The request. Never documents or field values." }),
  })
  .meta({
    id: "SignRequestWebhookEvent",
    examples: [
      {
        id: EVENT_ID_EXAMPLE,
        object: "event",
        type: "sign_request.signer_signed",
        api_version: LATEST_API_VERSION,
        created_at: "2026-10-26T15:10:00.100Z",
        data: {
          sign_request_id: REQUEST_ID_EXAMPLE,
          status: "sent",
          title: "Services agreement",
          metadata: { deal: "D-1042" },
          signer: {
            id: SIGNER_ID_EXAMPLE,
            name: "Ada Lovelace",
            email: "ada@example.com",
            client_ref: "user_42",
            status: "signed",
          },
          reason: null,
          sandbox: false,
          occurred_at: "2026-10-26T15:10:00.000Z",
        },
      },
    ],
  });
export type SignRequestWebhookEventOutput = z.output<typeof SignRequestWebhookEvent>;
/** What the outbox stores: the latest shape, without `api_version` (added per endpoint). */
export type StoredSignRequestWebhookEvent = Omit<SignRequestWebhookEventOutput, "api_version">;

// Templates.

export const MAX_SIGN_TEMPLATE_ROLES = MAX_SIGN_SIGNERS;
export const MAX_SIGN_MERGE_FIELD_LENGTH = 1000;
const TEMPLATE_ID_EXAMPLE = "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz";
const BUILDER_SESSION_ID_EXAMPLE = "sbs_01k7c8m4q2f3e9v6t5r1n0p8yz";

const RoleKey = z
  .string()
  .regex(/^[a-z0-9_]{1,32}$/, "Lowercase letters, digits and _, at most 32.")
  .meta({ description: "The role's key, e.g. `client`.", examples: ["client"] });
const MergeKey = z
  .string()
  .regex(/^[A-Za-z0-9_]{1,64}$/, "Letters, digits and _, at most 64.")
  .meta({
    description:
      "`text` fields only: filled from the request's `merge_fields[merge_key]` (shown to the signer, not editable). Without a value, the signer fills it.",
  });
/** A template role as the API takes it (the builder checks its saves with it too). */
export const SignTemplateRoleInput = z.strictObject({
  key: RoleKey.meta({
    description: "The role's id within the template, used by fields and signers.",
  }),
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .meta({ description: "Shown in the builder, e.g. `Client`." }),
});

const TemplateField = z.union([
  PlacedField.extend({ role: RoleKey, merge_key: MergeKey.optional() }),
  AnchoredField.extend({ role: RoleKey, merge_key: MergeKey.optional() }),
]);

const TemplateBody = {
  name: z.string().trim().min(1).max(200).meta({ description: "Your name for the template." }),
  title: z.string().trim().min(1).max(200).nullable().optional().meta({
    description: "Requests' title (a request may set its own). Default: `name`.",
  }),
  message: z.string().max(5000).nullable().optional().meta({
    description: "Requests' message to signers (a request may set its own).",
  }),
  signing_order: z.enum(SIGN_SIGNING_ORDERS).optional().meta({
    description:
      "`parallel`: everyone at once. `sequential`: in each signer's `order`. Default for its requests.",
  }),
  documents: z
    .array(DocumentInput)
    .max(MAX_SIGN_REQUEST_DOCUMENTS)
    .meta({ description: "Uploaded documents by id, or PDFs inline (base64)." }),
  roles: z.array(SignTemplateRoleInput).max(MAX_SIGN_TEMPLATE_ROLES).meta({
    description: "Who signs: each request names one signer per role.",
  }),
  fields: z.array(TemplateField).max(MAX_SIGN_FIELDS).meta({
    description:
      "Each role's fields, by position or text anchor (resolved when saved). A template can be used once every role has a `signature` field.",
  }),
};

const TEMPLATE_INPUT_EXAMPLE = {
  name: "Mutual NDA",
  documents: [{ document_id: DOCUMENT_ID_EXAMPLE }],
  roles: [
    { key: "client", name: "Client" },
    { key: "company", name: "Company" },
  ],
  fields: [
    { role: "client", type: "signature", anchor: "{{signature:client}}" },
    {
      role: "client",
      type: "text",
      page: 1,
      x: 72,
      y: 140,
      width: 200,
      height: 18,
      merge_key: "client_company",
    },
    { role: "company", type: "signature", anchor: "{{signature:company}}" },
  ],
};

export const CreateSignTemplateRequest = z
  .strictObject({
    ...TemplateBody,
    documents: TemplateBody.documents.optional(),
    roles: TemplateBody.roles.optional(),
    fields: TemplateBody.fields.optional(),
  })
  .meta({ id: "CreateSignTemplateRequest", examples: [TEMPLATE_INPUT_EXAMPLE] });
export type CreateSignTemplateRequestOutput = z.output<typeof CreateSignTemplateRequest>;

export const UpdateSignTemplateRequest = z
  .strictObject({
    name: TemplateBody.name.optional(),
    title: TemplateBody.title,
    message: TemplateBody.message,
    signing_order: TemplateBody.signing_order,
    documents: TemplateBody.documents.optional(),
    roles: TemplateBody.roles.optional(),
    fields: TemplateBody.fields.optional(),
  })
  .meta({
    id: "UpdateSignTemplateRequest",
    description:
      "Only the fields given change; `documents`, `roles` and `fields` replace the whole list (fields refer to documents by their new positions).",
    examples: [{ name: "Mutual NDA (2026)" }],
  });
export type UpdateSignTemplateRequestOutput = z.output<typeof UpdateSignTemplateRequest>;

export const SignTemplateObject = z
  .object({
    object: z.literal("sign_template"),
    id: z.string().meta({ examples: [TEMPLATE_ID_EXAMPLE] }),
    name: z.string().meta({ description: "Your name for the template." }),
    title: z
      .string()
      .nullable()
      .meta({ description: "Requests' title. `null`: the template's name." }),
    message: z
      .string()
      .nullable()
      .meta({ description: "Requests' message to signers. `null`: none." }),
    signing_order: z
      .enum(SIGN_SIGNING_ORDERS)
      .meta({ description: "Its requests' order, unless one sets its own." }),
    documents: z
      .array(
        z.object({
          id: z.string(),
          filename: z.string().meta({ description: "The file's name." }),
          sha256: z.string().meta({ description: "Hex SHA-256 of the uploaded bytes." }),
          page_count: z.number().int().meta({ description: "How many pages it has." }),
          pages: z.array(PageSize).meta({ description: "Each page's size, in order." }),
        }),
      )
      .meta({ description: "The documents its requests use, in order." }),
    roles: z
      .array(
        z.object({
          key: z.string().meta({ description: "The role's id within the template." }),
          name: z.string().meta({ description: "Shown in the builder, e.g. `Client`." }),
        }),
      )
      .meta({ description: "Who signs: each request names one signer per role." }),
    fields: z
      .array(
        z.object({
          id: z.string(),
          role: z.string().meta({ description: "The `key` of the role that fills it." }),
          document_id: z.string().meta({ description: "The id of the document it's on." }),
          type: z
            .enum(SIGN_FIELD_TYPES)
            .meta({ description: "What the field takes, as on a signature request." }),
          page: z.number().int().meta({ description: "1-based page number." }),
          x: z.number().meta({ description: "Left edge, in PDF points from the page's left." }),
          y: z.number().meta({ description: "Top edge, in PDF points from the page's top." }),
          width: z.number().meta({ description: "In PDF points." }),
          height: z.number().meta({ description: "In PDF points." }),
          required: z.boolean().meta({ description: "Whether a signer can finish with it empty." }),
          label: z.string().nullable().meta({ description: "Shown to the signer. `null`: none." }),
          merge_key: z.string().nullable().meta({
            description:
              "`text` fields: which `merge_fields` value fills it. `null`: the signer fills it.",
          }),
        }),
      )
      .meta({ description: "Each role's fields." }),
    ready: z.boolean().meta({
      description:
        "It has documents and every role has a `signature` field, so requests can be made from it.",
    }),
    sandbox: z.boolean().meta({ description: "Whether it belongs to a sandbox environment." }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({
    id: "SignTemplate",
    examples: [
      {
        object: "sign_template",
        id: TEMPLATE_ID_EXAMPLE,
        name: "Mutual NDA",
        title: null,
        message: null,
        signing_order: "parallel",
        documents: [
          {
            id: DOCUMENT_ID_EXAMPLE,
            filename: "nda.pdf",
            sha256: SHA256_EXAMPLE,
            page_count: 1,
            pages: [{ width: 612, height: 792 }],
          },
        ],
        roles: [{ key: "client", name: "Client" }],
        fields: [
          {
            id: "stfld_01k7c8m4q2f3e9v6t5r1n0p8yz",
            role: "client",
            document_id: DOCUMENT_ID_EXAMPLE,
            type: "signature",
            page: 1,
            x: 72,
            y: 640,
            width: 160,
            height: 30,
            required: true,
            label: null,
            merge_key: null,
          },
        ],
        ready: true,
        sandbox: false,
        created_at: CREATED_AT_EXAMPLE,
        updated_at: CREATED_AT_EXAMPLE,
      },
    ],
  });
export type SignTemplateObjectOutput = z.output<typeof SignTemplateObject>;

export const SignTemplateList = z
  .object({ object: z.literal("list"), data: z.array(SignTemplateObject), has_more: z.boolean() })
  .meta({ id: "SignTemplateList", examples: [{ object: "list", data: [], has_more: false }] });

export const DeletedSignTemplate = z
  .object({ object: z.literal("sign_template"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedSignTemplate",
    examples: [{ object: "sign_template", id: TEMPLATE_ID_EXAMPLE, deleted: true }],
  });

export const ListSignTemplatesQuery = z
  .object({ limit: ListLimit, after: After })
  .meta({ description: "Templates are returned newest first." });

export const CreateSignRequestFromTemplateRequest = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional().meta({
      description: "Default: the template's title (else its name).",
    }),
    message: z
      .string()
      .max(5000)
      .optional()
      .meta({ description: "Default: the template's message." }),
    signers: z
      .array(
        z.strictObject({
          role: RoleKey.meta({ description: "The `key` of the template's role they sign as." }),
          name: z
            .string()
            .trim()
            .min(1)
            .max(200)
            .meta({ description: "Shown on the signing page and in the audit trail." }),
          email: z
            .email()
            .max(254)
            .meta({ description: "Where a `delivery: email` signer gets their link." }),
          delivery: z.enum(SIGN_DELIVERIES).optional().meta({
            description:
              "`email` (default): coss.com emails the signer a link. `embedded`: your app shows the signing page.",
          }),
          order: z.number().int().min(1).max(MAX_SIGN_SIGNERS).optional().meta({
            description: "With `sequential` signing, signers sign in increasing `order`.",
          }),
          client_ref: z
            .string()
            .min(1)
            .max(255)
            .optional()
            .meta({ description: "Your own id for the signer, recorded in the audit trail." }),
        }),
      )
      .min(1)
      .max(MAX_SIGN_SIGNERS)
      .meta({ description: "One signer for each of the template's roles." }),
    merge_fields: z
      .record(z.string(), z.string().max(MAX_SIGN_MERGE_FIELD_LENGTH))
      .optional()
      .meta({ description: "Values of the template's merge fields, by `merge_key`." }),
    signing_order: z.enum(SIGN_SIGNING_ORDERS).optional().meta({
      description: "Default: the template's.",
    }),
    expires_at: z.iso
      .datetime({ offset: true })
      .optional()
      .meta({ description: "When an unfinished request expires, at most 365 days ahead." }),
    metadata: Metadata.optional(),
    reminder_interval_days: z
      .number()
      .int()
      .min(1)
      .max(MAX_SIGN_REMINDER_INTERVAL_DAYS)
      .nullable()
      .optional()
      .meta({
        description:
          "Days between reminders to email signers. Default: your Sign settings'. `null`: none.",
      }),
    send: z.boolean().optional().meta({ description: "Default `true`." }),
  })
  .meta({
    id: "CreateSignRequestFromTemplateRequest",
    examples: [
      {
        signers: [
          { role: "client", name: "Ada Lovelace", email: "ada@example.com" },
          { role: "company", name: "Grace Hopper", email: "grace@acme.com", delivery: "embedded" },
        ],
        merge_fields: { client_company: "Analytical Engines Ltd" },
      },
    ],
  });
export type CreateSignRequestFromTemplateRequestOutput = z.output<
  typeof CreateSignRequestFromTemplateRequest
>;

export const CreateSignBuilderSessionRequest = z
  .strictObject({
    expires_in: z
      .number()
      .int()
      .min(60)
      .max(MAX_SIGN_SESSION_EXPIRES_IN)
      .optional()
      .meta({
        description: `Seconds until the link expires: default ${DEFAULT_SIGN_SESSION_EXPIRES_IN}, at most ${MAX_SIGN_SESSION_EXPIRES_IN}.`,
      }),
  })
  .meta({ id: "CreateSignBuilderSessionRequest", examples: [{ expires_in: 3600 }] });

export const SignBuilderSessionObject = z
  .object({
    object: z.literal("sign_builder_session"),
    id: z.string().meta({ examples: [BUILDER_SESSION_ID_EXAMPLE] }),
    template_id: z.string().meta({ description: "The id of the template it edits." }),
    url: z.string().meta({
      description:
        "The builder: embed it (from an allowed origin, `mountBuilder` from `coss/sign`) for whoever edits the template: they can upload documents, add roles and place fields. Show it only to them.",
    }),
    token: z.string().meta({ description: "The secret part of `url`, shown only here." }),
    expires_at: z.iso.datetime().meta({ description: "When the link stops working." }),
  })
  .meta({
    id: "SignBuilderSession",
    examples: [
      {
        object: "sign_builder_session",
        id: BUILDER_SESSION_ID_EXAMPLE,
        template_id: TEMPLATE_ID_EXAMPLE,
        url: `https://sign.example/b/${BUILDER_SESSION_ID_EXAMPLE}#cossb_…`,
        token: "cossb_…",
        expires_at: CREATED_AT_EXAMPLE,
      },
    ],
  });
export type SignBuilderSessionObjectOutput = z.output<typeof SignBuilderSessionObject>;
