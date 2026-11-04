/**
 * Public wire schemas for Forms (snake_case). Plain zod with `.meta({ id })`, shared by the public
 * API, its OpenAPI document and the contract tests. Must not import the database (or
 * `@coss/email`): `@coss/forms/schemas` is safe to load anywhere.
 */
import { LATEST_API_VERSION } from "@coss/versioning";
import { z } from "zod";

export const FORM_FIELD_TYPES = [
  "text",
  "email",
  "textarea",
  "number",
  "tel",
  "url",
  "date",
  "select",
  "radio",
  "checkbox",
  "hidden",
  "file",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** Field types that pick from `options`. */
export const FORM_CHOICE_FIELD_TYPES: readonly FormFieldType[] = ["select", "radio"];

export const FORM_SUBMISSION_STATUSES = [
  "pending_confirmation",
  "accepted",
  "held",
  "spam",
] as const;
export type FormSubmissionStatus = (typeof FORM_SUBMISSION_STATUSES)[number];

export const FORM_SPAM_REASONS = ["honeypot", "risk_block", "risk_review", "content"] as const;
export type FormSpamReason = (typeof FORM_SPAM_REASONS)[number];

export const FORM_CAPTCHA_MODES = ["off", "required"] as const;
export const FORM_ON_REVIEW = ["deliver", "hold"] as const;

export const MAX_FORMS_PER_ENVIRONMENT = 100;
/** Fields a form can define. */
export const MAX_FORM_FIELDS = 50;
export const MAX_FORM_FIELD_OPTIONS = 50;
/** Fields one submission can carry (named, defined or not), its control fields aside. */
export const MAX_SUBMISSION_FIELDS = 100;
/**
 * Field names the endpoint reads as controls (a redirect, the device token, the hosted page's
 * marker, captcha tokens): never a form's honeypot, or every honest post would look filled in.
 */
export const RESERVED_FORM_FIELD_NAMES = [
  "_next",
  "_coss_device",
  "_hosted",
  "cf-turnstile-response",
  "h-captcha-response",
] as const;
/** Values one submission can carry in all (a field repeated for checkboxes counts each). */
export const MAX_SUBMISSION_VALUES = 1000;
export const MAX_SUBMISSION_VALUE_LENGTH = 10_000;
/** Text of one submission, every value counted in UTF-8. */
export const MAX_SUBMISSION_TEXT_BYTES = 64 * 1024;
export const MAX_FORM_ORIGINS = 10;
export const MAX_FORM_NOTIFY_RECIPIENTS = 5;
export const MAX_FORM_FILES = 10;
export const DEFAULT_FORM_MAX_FILES = 3;
export const MAX_FORM_FILE_BYTES = 10 * 1024 * 1024;
/** Every file of one submission together. */
export const MAX_SUBMISSION_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FORM_CONTACT_PROPERTIES = 20;
export const DEFAULT_FORM_LIST_LIMIT = 20;
export const MAX_FORM_LIST_LIMIT = 100;
/** How long a submitter's verification link works. */
export const FORM_CONFIRMATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * File types accepted when a form doesn't list its own: images (no SVG: it can carry script),
 * PDFs, plain text, CSV and Office documents. Files are only ever downloaded, never shown inline.
 */
export const DEFAULT_FORM_FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/** Types never accepted, whatever a form lists: markup and scripts a browser could run. */
export const BLOCKED_FORM_FILE_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/javascript",
  "text/javascript",
  "application/x-msdownload",
] as const;

/**
 * Field names a submission may carry that aren't data: the honeypot (its name is the form's),
 * `_next` (where to redirect), `_coss_device` (the `coss/device` token) and the captcha widgets'
 * tokens. Any other name starting with `_` is dropped too.
 */
export const FORM_CONTROL_FIELDS = [
  "_next",
  "_coss_device",
  "cf-turnstile-response",
  "h-captcha-response",
] as const;

/** Names a field can have: letters, digits, `_ . - [ ]`, at most 64, not starting with `_`. */
export const FORM_FIELD_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.\-[\]]{0,63}$/;

/**
 * Hosted pages never ask for these: a credential-phishing page is the abuse a form host invites.
 * Matched against a field's name and label, case-insensitively.
 */
export const FORBIDDEN_HOSTED_FIELD_PATTERN =
  /pass(word|code|phrase)?\b|passwd|\bpin\b|\bcvv\b|\bcvc\b|card.?number|credit.?card|\bssn\b|social.?security|seed.?phrase|private.?key|2fa|one.?time.?code|\botp\b/i;

const FORM_ID_EXAMPLE = "form_01kd2m8n3p4q5r6s7t8v9w0x1y";
const SUBMISSION_ID_EXAMPLE = "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k";
const FILE_ID_EXAMPLE = "ffile_01kd2m9a0b1c2d3e4f5g6h7j8m";
const CREATED_AT_EXAMPLE = "2026-10-29T10:00:00.000Z";

const FieldName = z
  .string()
  .regex(FORM_FIELD_NAME_PATTERN, "Letters, digits and _ . - [ ], not starting with _.")
  .meta({ description: "The `name` the form's input posts." });

export const FormFieldInput = z
  .strictObject({
    name: FieldName,
    type: z.enum(FORM_FIELD_TYPES).meta({
      description:
        "Validates the value (`email`, `number`, `url`, `date` as `YYYY-MM-DD`, `select`/`radio` one of `options`, `checkbox` any of them or `on`) and picks the input on hosted pages. `file` needs uploads on (`files.enabled`).",
    }),
    label: z.string().min(1).max(200).optional().meta({
      description: "Shown on hosted pages and in notifications. Default: the name.",
    }),
    required: z.boolean().optional().meta({ description: "Default false." }),
    placeholder: z
      .string()
      .max(200)
      .optional()
      .meta({ description: "Shown in the empty input on hosted pages." }),
    options: z
      .array(z.string().min(1).max(200))
      .max(MAX_FORM_FIELD_OPTIONS)
      .optional()
      .meta({ description: "The choices of `select`, `radio` and `checkbox` fields." }),
    max_length: z
      .number()
      .int()
      .min(1)
      .max(MAX_SUBMISSION_VALUE_LENGTH)
      .optional()
      .meta({ description: "The longest value accepted, in characters." }),
  })
  .meta({ id: "FormFieldInput" });
export type FormFieldInputOutput = z.output<typeof FormFieldInput>;

const FormField = z
  .object({
    name: z.string().meta({ description: "The `name` the form's input posts." }),
    type: z
      .enum(FORM_FIELD_TYPES)
      .meta({ description: "Validates the value and picks the input on hosted pages." }),
    label: z
      .string()
      .nullable()
      .meta({ description: "Shown on hosted pages and in notifications. `null`: the name." }),
    required: z.boolean().meta({ description: "Whether a submission must include it." }),
    placeholder: z
      .string()
      .nullable()
      .meta({ description: "Shown in the empty input on hosted pages. `null`: none." }),
    options: z.array(z.string()).meta({
      description: "The choices of `select`, `radio` and `checkbox` fields. Empty for other types.",
    }),
    max_length: z.number().int().nullable().meta({
      description: "The longest value accepted, in characters. `null`: only the overall limit.",
    }),
  })
  .meta({ id: "FormField" });

const Origins = z.array(z.string().max(255)).max(MAX_FORM_ORIGINS);

const SpamInput = z.strictObject({
  honeypot_field: z
    .string()
    .regex(/^_?[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
    .optional()
    .meta({
      description:
        "A field people leave empty (hide it with CSS); a submission that fills it is spam. Default `_gotcha`.",
    }),
  captcha: z.enum(FORM_CAPTCHA_MODES).optional().meta({
    description:
      "`required`: submissions need a token from the captcha set in the environment's risk settings (Turnstile or hCaptcha). Default `off`.",
  }),
  captcha_site_key: z.string().min(1).max(200).nullable().optional().meta({
    description: "The captcha's site key, which hosted pages render the widget with.",
  }),
  content_threshold: z.number().min(0.5).max(1).nullable().optional().meta({
    description:
      "A submission whose text scores at least this in a content category (spam, phishing, malware, fraud) is spam. Default 0.9; `null` leaves content to the environment's risk settings.",
  }),
  on_review: z.enum(FORM_ON_REVIEW).optional().meta({
    description:
      "What happens when Risk's decision is `review`: `hold` (default) keeps the submission until you release it, `deliver` delivers it.",
  }),
});

const SubmitterInput = z.strictObject({
  email_field: FieldName.optional().meta({
    description:
      "The field holding the submitter's email address (Risk checks it, notifications reply to it, contacts are made from it). Default `email`.",
  }),
  verify: z.boolean().optional().meta({
    description:
      "Hold every submission until the submitter clicks the link emailed to them (double opt-in for the whole submission). Default false.",
  }),
  confirmation_from: z.email().max(254).nullable().optional().meta({
    description:
      "The verification email's sender: an address on a verified domain (required with `verify` in live environments).",
  }),
});

const NotificationsInput = z.strictObject({
  recipients: z.array(z.email().max(254)).max(MAX_FORM_NOTIFY_RECIPIENTS).optional().meta({
    description:
      "Who gets an email for each accepted submission: members of your organization, or addresses on its verified domains.",
  }),
  from: z.email().max(254).nullable().optional().meta({
    description:
      'The notification\'s sender, on a verified domain in live environments. `null`: coss.com, as "<form name> via coss.com".',
  }),
});

const ContactsInput = z.strictObject({
  enabled: z.boolean().optional().meta({
    description:
      "Turn each accepted submission into a contact, from `submitter.email_field`. Default false.",
  }),
  audience_ids: z
    .array(z.string().max(64))
    .max(20)
    .optional()
    .meta({ description: "Audiences the contact joins. They must exist in this environment." }),
  topics: z.array(z.string().min(1).max(64)).max(20).optional().meta({
    description: "Topic keys the contact is opted into.",
  }),
  double_opt_in: z.boolean().nullable().optional().meta({
    description:
      "New contacts confirm their subscription by email first. `null` (default): the environment's marketing settings decide.",
  }),
  first_name_field: FieldName.nullable()
    .optional()
    .meta({ description: "The field holding the contact's first name. `null`: none." }),
  last_name_field: FieldName.nullable()
    .optional()
    .meta({ description: "The field holding the contact's last name. `null`: none." }),
  properties: z
    .record(z.string().min(1).max(64), FieldName)
    .optional()
    .meta({ description: "Contact property key → the field whose value it takes." }),
});

const FilesInput = z.strictObject({
  enabled: z.boolean().optional().meta({
    description: "Accept uploads (`multipart/form-data`). Default false.",
  }),
  max_files: z
    .number()
    .int()
    .min(1)
    .max(MAX_FORM_FILES)
    .optional()
    .meta({ description: "Most files per submission. Default 3." }),
  max_file_bytes: z
    .number()
    .int()
    .min(1)
    .max(MAX_FORM_FILE_BYTES)
    .optional()
    .meta({ description: "Largest file, in bytes. Default and maximum 10 MB." }),
  allowed_types: z
    .array(z.string().regex(/^[a-z0-9.+-]+\/([a-z0-9.+-]+|\*)$/))
    .max(50)
    .optional()
    .meta({ description: "MIME types (`image/*` allowed). Empty: images, PDFs, text and Office." }),
});

const HostedInput = z.strictObject({
  enabled: z.boolean().optional().meta({
    description: "Serve the form as a page at its `hosted_url` (needs `fields`). Default false.",
  }),
  title: z
    .string()
    .min(1)
    .max(200)
    .nullable()
    .optional()
    .meta({ description: "The page's heading. `null`: the form's name." }),
  description: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .meta({ description: "Text under the heading. `null`: none." }),
  submit_label: z
    .string()
    .min(1)
    .max(60)
    .nullable()
    .optional()
    .meta({ description: "The submit button's label. `null`: the default." }),
  success_message: z
    .string()
    .min(1)
    .max(500)
    .nullable()
    .optional()
    .meta({ description: "Shown after a submission. `null`: the default." }),
});

const FormSettingsInput = {
  enabled: z.boolean().optional().meta({ description: "`false`: submissions are refused." }),
  fields: z.array(FormFieldInput).max(MAX_FORM_FIELDS).nullable().optional().meta({
    description:
      "The form's fields. `null` (default): any field is accepted. With fields, submissions are validated against them.",
  }),
  strict_fields: z.boolean().optional().meta({
    description: "With `fields`: refuse fields the form doesn't define. Default false.",
  }),
  allowed_origins: Origins.optional().meta({
    description:
      "Sites that may post to the form, like `https://www.example.com` (sandbox environments also `http://localhost:<port>`). Empty (default): any.",
  }),
  redirect_url: z.url().max(2048).nullable().optional().meta({
    description:
      "Where browsers go after an HTML post. `null`: coss.com's thank-you page. A post's `_next` field overrides it when its origin is allowed.",
  }),
  spam: SpamInput.optional().meta({
    description: "How submissions are screened. Only the fields given change.",
  }),
  submitter: SubmitterInput.optional().meta({
    description:
      "Who the submitter is, and whether they must confirm by email. Only the fields given change.",
  }),
  notifications: NotificationsInput.optional().meta({
    description: "Emails about accepted submissions. Only the fields given change.",
  }),
  contacts: ContactsInput.optional().meta({
    description: "Turning submissions into contacts. Only the fields given change.",
  }),
  files: FilesInput.optional().meta({ description: "File uploads. Only the fields given change." }),
  hosted: HostedInput.optional().meta({
    description: "The page coss.com can serve for this form. Only the fields given change.",
  }),
};

export const CreateFormRequest = z
  .strictObject({
    name: z.string().min(1).max(100).meta({
      description: "Your name for the form, shown in the dashboard and in notifications.",
    }),
    ...FormSettingsInput,
  })
  .meta({
    id: "CreateFormRequest",
    examples: [
      {
        name: "Contact us",
        allowed_origins: ["https://www.example.com"],
        notifications: { recipients: ["support@example.com"] },
      },
    ],
  });
export type CreateFormRequestOutput = z.output<typeof CreateFormRequest>;

export const UpdateFormRequest = z
  .strictObject({
    name: z.string().min(1).max(100).optional().meta({
      description: "Your name for the form, shown in the dashboard and in notifications.",
    }),
    ...FormSettingsInput,
  })
  .meta({
    id: "UpdateFormRequest",
    description: "Only the fields given change, within each group too.",
    examples: [{ spam: { captcha: "required" }, contacts: { enabled: true } }],
  });
export type UpdateFormRequestOutput = z.output<typeof UpdateFormRequest>;

export const FormObject = z
  .object({
    object: z.literal("form"),
    id: z.string().meta({ examples: [FORM_ID_EXAMPLE] }),
    name: z.string().meta({
      description: "Your name for the form, shown in the dashboard and in notifications.",
    }),
    enabled: z.boolean().meta({ description: "`false`: submissions are refused." }),
    endpoint: z.string().meta({ description: "Where the form posts: `<form action=…>`." }),
    hosted_url: z
      .string()
      .nullable()
      .meta({ description: "The hosted page, when `hosted.enabled`; `null` otherwise." }),
    fields: z.array(FormField).nullable().meta({
      description: "The form's fields. `null`: any field is accepted, without validation.",
    }),
    strict_fields: z
      .boolean()
      .meta({ description: "With `fields`: whether fields the form doesn't define are refused." }),
    allowed_origins: z
      .array(z.string())
      .meta({ description: "Sites that may post to the form. Empty: any." }),
    redirect_url: z.string().nullable().meta({
      description: "Where browsers go after an HTML post. `null`: coss.com's thank-you page.",
    }),
    spam: z
      .object({
        honeypot_field: z
          .string()
          .meta({ description: "A field people leave empty; a submission that fills it is spam." }),
        captcha: z.enum(FORM_CAPTCHA_MODES).meta({
          description: "`required`: submissions need a captcha token. `off`: they don't.",
        }),
        captcha_site_key: z.string().nullable().meta({
          description:
            "The captcha's site key, which hosted pages render the widget with. `null`: none set.",
        }),
        content_threshold: z.number().nullable().meta({
          description:
            "A submission whose text scores at least this in a content category is spam. `null`: the environment's risk settings decide.",
        }),
        on_review: z.enum(FORM_ON_REVIEW).meta({
          description:
            "When Risk's decision is `review`: `hold` keeps the submission until you release it, `deliver` delivers it.",
        }),
      })
      .meta({ description: "How submissions are screened." }),
    submitter: z
      .object({
        email_field: z
          .string()
          .meta({ description: "The field holding the submitter's email address." }),
        verify: z.boolean().meta({
          description:
            "Whether submissions wait until the submitter clicks a link emailed to them.",
        }),
        confirmation_from: z
          .string()
          .nullable()
          .meta({ description: "The verification email's sender. `null`: none set." }),
      })
      .meta({ description: "Who the submitter is, and whether they must confirm by email." }),
    notifications: z
      .object({
        recipients: z
          .array(z.string())
          .meta({ description: "Who gets an email for each accepted submission." }),
        from: z.string().nullable().meta({
          description:
            'The notification\'s sender. `null`: coss.com, as "<form name> via coss.com".',
        }),
      })
      .meta({ description: "Emails about accepted submissions." }),
    contacts: z
      .object({
        enabled: z
          .boolean()
          .meta({ description: "Whether each accepted submission becomes a contact." }),
        audience_ids: z.array(z.string()).meta({ description: "Audiences the contact joins." }),
        topics: z.array(z.string()).meta({ description: "Topic keys the contact is opted into." }),
        double_opt_in: z.boolean().nullable().meta({
          description:
            "Whether new contacts confirm by email first. `null`: the environment's marketing settings decide.",
        }),
        first_name_field: z
          .string()
          .nullable()
          .meta({ description: "The field holding the contact's first name. `null`: none." }),
        last_name_field: z
          .string()
          .nullable()
          .meta({ description: "The field holding the contact's last name. `null`: none." }),
        properties: z
          .record(z.string(), z.string())
          .meta({ description: "Contact property key → the field whose value it takes." }),
      })
      .meta({ description: "Turning submissions into contacts." }),
    files: z
      .object({
        enabled: z
          .boolean()
          .meta({ description: "Whether uploads are accepted (`multipart/form-data`)." }),
        max_files: z.number().int().meta({ description: "Most files per submission." }),
        max_file_bytes: z.number().int().meta({ description: "Largest file, in bytes." }),
        allowed_types: z
          .array(z.string())
          .meta({ description: "MIME types accepted. Empty: images, PDFs, text and Office." }),
      })
      .meta({ description: "File uploads." }),
    hosted: z
      .object({
        enabled: z.boolean().meta({ description: "Whether the page is served at `hosted_url`." }),
        title: z
          .string()
          .nullable()
          .meta({ description: "The page's heading. `null`: the form's name." }),
        description: z
          .string()
          .nullable()
          .meta({ description: "Text under the heading. `null`: none." }),
        submit_label: z
          .string()
          .nullable()
          .meta({ description: "The submit button's label. `null`: the default." }),
        success_message: z
          .string()
          .nullable()
          .meta({ description: "Shown after a submission. `null`: the default." }),
        published_at: z.iso.datetime().nullable().meta({
          description:
            "When the page was turned on, or what it shows last changed. `null`: never published.",
        }),
      })
      .meta({ description: "The page coss.com can serve for this form." }),
    disabled_by_admin: z.boolean().meta({
      description: "coss.com disabled the form for abuse; contact support.",
    }),
    sandbox: z
      .boolean()
      .meta({ description: "Whether the form belongs to a sandbox environment." }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({
    id: "Form",
    examples: [
      {
        object: "form",
        id: FORM_ID_EXAMPLE,
        name: "Contact us",
        enabled: true,
        endpoint: `https://cossforms.com/f/${FORM_ID_EXAMPLE}`,
        hosted_url: null,
        fields: null,
        strict_fields: false,
        allowed_origins: ["https://www.example.com"],
        redirect_url: null,
        spam: {
          honeypot_field: "_gotcha",
          captcha: "off",
          captcha_site_key: null,
          content_threshold: 0.9,
          on_review: "hold",
        },
        submitter: { email_field: "email", verify: false, confirmation_from: null },
        notifications: { recipients: ["support@example.com"], from: null },
        contacts: {
          enabled: false,
          audience_ids: [],
          topics: [],
          double_opt_in: null,
          first_name_field: null,
          last_name_field: null,
          properties: {},
        },
        files: {
          enabled: false,
          max_files: DEFAULT_FORM_MAX_FILES,
          max_file_bytes: MAX_FORM_FILE_BYTES,
          allowed_types: [],
        },
        hosted: {
          enabled: false,
          title: null,
          description: null,
          submit_label: null,
          success_message: null,
          published_at: null,
        },
        disabled_by_admin: false,
        sandbox: false,
        created_at: CREATED_AT_EXAMPLE,
        updated_at: CREATED_AT_EXAMPLE,
      },
    ],
  });
export type FormObjectOutput = z.output<typeof FormObject>;

export const FormList = z
  .object({ object: z.literal("list"), data: z.array(FormObject), has_more: z.boolean() })
  .meta({ id: "FormList", examples: [{ object: "list", data: [], has_more: false }] });

export const DeletedForm = z
  .object({ object: z.literal("form"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedForm",
    examples: [{ object: "form", id: FORM_ID_EXAMPLE, deleted: true }],
  });

const ListLimit = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_FORM_LIST_LIMIT)
  .optional()
  .meta({ description: `1-${MAX_FORM_LIST_LIMIT}, default ${DEFAULT_FORM_LIST_LIMIT}.` });

const After = z
  .string()
  .max(64)
  .optional()
  .meta({ description: "Cursor: the `id` of the last item of the previous page." });

export const ListFormsQuery = z
  .strictObject({ limit: ListLimit, after: After })
  .meta({ description: "Forms are returned newest first." });
export type ListFormsQueryOutput = z.output<typeof ListFormsQuery>;

const SubmissionData = z
  .record(z.string(), z.union([z.string(), z.array(z.string())]))
  .meta({ description: "Field name → value; a field posted several times has an array." });

const FormSubmissionFileObject = z
  .object({
    id: z.string().meta({ examples: [FILE_ID_EXAMPLE] }),
    field: z.string().meta({ description: "The form field it was uploaded through." }),
    filename: z.string().meta({ description: "The file's name, made safe." }),
    content_type: z.string().meta({ description: "The MIME type it was uploaded as." }),
    size: z.number().int().meta({ description: "Bytes." }),
  })
  .meta({ id: "FormSubmissionFile" });

export const FormSubmissionObject = z
  .object({
    object: z.literal("form_submission"),
    id: z.string().meta({ examples: [SUBMISSION_ID_EXAMPLE] }),
    form_id: z.string().meta({ description: "The id of the form it was posted to." }),
    status: z.enum(FORM_SUBMISSION_STATUSES).meta({
      description:
        "`accepted`: delivered (webhooks, notifications, contacts). `held`: Risk asked for a review. `spam`: refused by Risk, the content check or the honeypot. `pending_confirmation`: waiting for the submitter's email link.",
    }),
    data: SubmissionData,
    submitter_email: z.string().nullable().meta({
      description: "The value of the form's `submitter.email_field`. `null` when it has none.",
    }),
    files: z
      .array(FormSubmissionFileObject)
      .meta({ description: "Uploaded files. Download them with the API." }),
    spam_reason: z.enum(FORM_SPAM_REASONS).nullable().meta({
      description:
        "Why it was flagged. `honeypot`: the honeypot field was filled. `risk_block`: Risk blocked it. `risk_review`: Risk asked for a review. `content`: its text passed `content_threshold`. `null`: not flagged.",
    }),
    risk: z
      .object({
        assessment_id: z
          .string()
          .nullable()
          .meta({ description: "The id of Risk's assessment. `null`: none is recorded." }),
        decision: z
          .enum(["allow", "review", "block"])
          .nullable()
          .meta({ description: "Risk's decision. `null`: none is recorded." }),
        score: z
          .number()
          .nullable()
          .meta({ description: "Risk's score. `null`: none is recorded." }),
      })
      .nullable()
      .meta({ description: "Risk's assessment; `null` when none ran (honeypot)." }),
    ip: z
      .string()
      .nullable()
      .meta({ description: "The address it was posted from. `null`: unknown." }),
    user_agent: z
      .string()
      .nullable()
      .meta({ description: "The browser's `User-Agent`. `null`: not sent." }),
    origin: z
      .string()
      .nullable()
      .meta({ description: "The site it was posted from. `null`: not sent." }),
    referrer: z
      .string()
      .nullable()
      .meta({ description: "The page it was posted from. `null`: not sent." }),
    confirmed_at: z.iso.datetime().nullable().meta({
      description:
        "When the submitter clicked the emailed link. `null`: they haven't, or the form doesn't verify.",
    }),
    accepted_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it became `accepted`. `null`: it hasn't." }),
    released_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When it was released from `held` or `spam`. `null`: it wasn't." }),
    sandbox: z.boolean().meta({ description: "Whether it belongs to a sandbox environment." }),
    created_at: z.iso.datetime(),
  })
  .meta({
    id: "FormSubmission",
    examples: [
      {
        object: "form_submission",
        id: SUBMISSION_ID_EXAMPLE,
        form_id: FORM_ID_EXAMPLE,
        status: "accepted",
        data: { name: "Ada Lovelace", email: "ada@example.com", message: "Hello!" },
        submitter_email: "ada@example.com",
        files: [],
        spam_reason: null,
        risk: { assessment_id: "rsk_01kd2m9a0b1c2d3e4f5g6h7j8n", decision: "allow", score: 0.04 },
        ip: "203.0.113.7",
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        origin: "https://www.example.com",
        referrer: "https://www.example.com/contact",
        confirmed_at: null,
        accepted_at: CREATED_AT_EXAMPLE,
        released_at: null,
        sandbox: false,
        created_at: CREATED_AT_EXAMPLE,
      },
    ],
  });
export type FormSubmissionObjectOutput = z.output<typeof FormSubmissionObject>;

export const FormSubmissionList = z
  .object({ object: z.literal("list"), data: z.array(FormSubmissionObject), has_more: z.boolean() })
  .meta({ id: "FormSubmissionList", examples: [{ object: "list", data: [], has_more: false }] });

export const DeletedFormSubmission = z
  .object({ object: z.literal("form_submission"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedFormSubmission",
    examples: [{ object: "form_submission", id: SUBMISSION_ID_EXAMPLE, deleted: true }],
  });

export const ListFormSubmissionsQuery = z
  .strictObject({
    status: z
      .string()
      .transform((value, ctx) => {
        const out: FormSubmissionStatus[] = [];
        for (const part of value.split(",").map((piece) => piece.trim())) {
          if (part.length === 0) continue;
          const parsed = z.enum(FORM_SUBMISSION_STATUSES).safeParse(part);
          if (!parsed.success) {
            ctx.addIssue({ code: "custom", message: `Invalid value "${part}".` });
            return z.NEVER;
          }
          out.push(parsed.data);
        }
        return out;
      })
      .optional()
      .meta({
        description: "Only submissions in these statuses, comma-separated: `held,spam`.",
      }),
    limit: ListLimit,
    after: After,
  })
  .meta({ description: "Submissions are returned newest first." });
export type ListFormSubmissionsQueryOutput = z.output<typeof ListFormSubmissionsQuery>;

// Webhook events.

/** `form.submission.*` webhook events. */
export const FORM_WEBHOOK_EVENT_TYPES = [
  "form.submission.received",
  "form.submission.flagged",
] as const;
export type FormWebhookEventType = (typeof FORM_WEBHOOK_EVENT_TYPES)[number];

const ApiVersion = z.string().meta({
  description: "The API version the payload is rendered in (your endpoint's version).",
  examples: [LATEST_API_VERSION],
});

export const FormSubmissionWebhookEvent = z
  .object({
    id: z.string().meta({ description: "The event id." }),
    object: z.literal("event"),
    type: z.enum(FORM_WEBHOOK_EVENT_TYPES).meta({
      description:
        "`received`: a submission was accepted (at once, after the submitter confirmed, or released from review). `flagged`: Risk held it for review or refused it (honeypot catches send nothing).",
    }),
    api_version: ApiVersion,
    created_at: z.iso.datetime().meta({ description: "When the event was created." }),
    data: z
      .object({
        form_id: z.string().meta({ description: "The form's id." }),
        form_name: z.string().meta({ description: "The form's name." }),
        submission_id: z.string().meta({ description: "The submission's id." }),
        status: z
          .enum(FORM_SUBMISSION_STATUSES)
          .meta({ description: "The submission's status after this event." }),
        data: SubmissionData,
        submitter_email: z.string().nullable().meta({
          description: "The value of the form's `submitter.email_field`. `null` when it has none.",
        }),
        files: z.array(FormSubmissionFileObject).meta({
          description: "Uploaded files (download them with the API; never their bytes here).",
        }),
        spam_reason: z
          .enum(FORM_SPAM_REASONS)
          .nullable()
          .meta({ description: "Why it was flagged. `null`: not flagged." }),
        sandbox: z.boolean().meta({ description: "Whether it belongs to a sandbox environment." }),
        occurred_at: z.iso.datetime().meta({ description: "When this happened." }),
      })
      .meta({ description: "The submission." }),
  })
  .meta({
    id: "FormSubmissionWebhookEvent",
    examples: [
      {
        id: "evt_01kd2m9a0b1c2d3e4f5g6h7j8p",
        object: "event",
        type: "form.submission.received",
        api_version: LATEST_API_VERSION,
        created_at: "2026-10-29T10:00:00.100Z",
        data: {
          form_id: FORM_ID_EXAMPLE,
          form_name: "Contact us",
          submission_id: SUBMISSION_ID_EXAMPLE,
          status: "accepted",
          data: { name: "Ada Lovelace", email: "ada@example.com", message: "Hello!" },
          submitter_email: "ada@example.com",
          files: [],
          spam_reason: null,
          sandbox: false,
          occurred_at: CREATED_AT_EXAMPLE,
        },
      },
    ],
  });
export type FormSubmissionWebhookEventOutput = z.output<typeof FormSubmissionWebhookEvent>;
/** What the outbox stores: the latest shape, without `api_version` (added per endpoint). */
export type StoredFormSubmissionWebhookEvent = Omit<
  FormSubmissionWebhookEventOutput,
  "api_version"
>;
