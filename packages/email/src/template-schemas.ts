/**
 * Wire schemas of email templates (re-exported by `schemas.ts`, so `@coss/email/schemas`). Plain
 * zod, no database.
 */
import { z } from "zod";
import {
  canonicalLocale,
  MAX_TEMPLATE_LIST_FIELDS,
  MAX_TEMPLATE_LOCALES,
  MAX_TEMPLATE_VARIABLES,
  MAX_TEMPLATE_VARIABLES_BYTES,
  RESERVED_TEMPLATE_NAMES,
  TEMPLATE_FIELDS,
  TEMPLATE_SCALAR_TYPES,
  TEMPLATE_SOURCE_LIMITS,
  TEMPLATE_VARIABLE_NAME,
  TEMPLATE_VARIABLE_TYPES,
} from "./template-language.ts";

export const TEMPLATE_NAME_MAX_LENGTH = 100;
export const TEMPLATE_DESCRIPTION_MAX_LENGTH = 500;
export const TEMPLATE_ALIAS = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const DEFAULT_TEMPLATE_LIST_LIMIT = 50;
export const MAX_TEMPLATE_LIST_LIMIT = 100;
export const DEFAULT_TEMPLATE_VERSION_LIST_LIMIT = 10;
export const MAX_TEMPLATE_VERSION_LIST_LIMIT = 20;

const TEMPLATE_ID_EXAMPLE = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz";

/** A BCP 47 language tag, returned in canonical form (`en-us` → `en-US`). */
export const TemplateLocale = z
  .string()
  .max(35)
  .superRefine((value, ctx) => {
    if (canonicalLocale(value) === null) {
      ctx.addIssue({
        code: "custom",
        message: 'Expected a BCP 47 language tag, e.g. "en" or "pt-BR".',
      });
    }
  })
  .transform((value) => canonicalLocale(value) ?? value)
  .meta({ description: 'A BCP 47 language tag, e.g. "en" or "pt-BR".', examples: ["en"] });

const VariableName = z
  .string()
  .regex(
    TEMPLATE_VARIABLE_NAME,
    "Names are 1-64 letters, digits and underscores, not starting with a digit.",
  )
  .refine((value) => !RESERVED_TEMPLATE_NAMES.has(value), {
    error: "This name is reserved by the template language.",
  });

const Scalar = z.union([z.string(), z.number(), z.boolean()]);

const TemplateListFieldInput = z.strictObject({
  name: VariableName.meta({ description: "Used inside `{{#each}}` as `{{name}}`." }),
  type: z.enum(TEMPLATE_SCALAR_TYPES).meta({ description: "The field's type." }),
  required: z
    .boolean()
    .default(true)
    .meta({ description: "Whether each item must have it. Defaults to true." }),
});

function matchesType(type: string, value: unknown): boolean {
  return type === "number"
    ? typeof value === "number" && Number.isFinite(value)
    : typeof value === type;
}

function uniqueNames(
  items: readonly { name: string }[],
  ctx: z.RefinementCtx,
  what: string,
  path: (string | number)[] = [],
): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.name)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, index, "name"],
        message: `Duplicate ${what} "${item.name}".`,
      });
    }
    seen.add(item.name);
  }
}

export const TemplateVariableInput = z
  .strictObject({
    name: VariableName.meta({ description: "Used in the template as `{{name}}`." }),
    type: z.enum(TEMPLATE_VARIABLE_TYPES).meta({
      description:
        "`string`, `number`, `boolean`, or `list` (an array of objects with the declared `fields`, " +
        "looped over with `{{#each name}}`).",
    }),
    required: z
      .boolean()
      .default(true)
      .meta({ description: "Sends must pass it unless it has a `default`. Defaults to true." }),
    default: Scalar.optional().meta({
      description: "Used when a send leaves it out. Not for lists.",
    }),
    description: z
      .string()
      .max(TEMPLATE_DESCRIPTION_MAX_LENGTH)
      .optional()
      .meta({ description: "What it's for, shown in the dashboard." }),
    fields: z
      .array(TemplateListFieldInput)
      .min(1)
      .max(MAX_TEMPLATE_LIST_FIELDS)
      .optional()
      .meta({ description: "A list's item fields (required for lists, only for lists)." }),
  })
  .superRefine((value, ctx) => {
    if (value.type === "list") {
      if (!value.fields) {
        ctx.addIssue({ code: "custom", path: ["fields"], message: "Lists need `fields`." });
      } else {
        uniqueNames(value.fields, ctx, "field", ["fields"]);
      }
      if (value.default !== undefined) {
        ctx.addIssue({ code: "custom", path: ["default"], message: "Lists can't have a default." });
      }
    } else {
      if (value.fields) {
        ctx.addIssue({ code: "custom", path: ["fields"], message: "Only lists have `fields`." });
      }
      if (value.default !== undefined && !matchesType(value.type, value.default)) {
        ctx.addIssue({
          code: "custom",
          path: ["default"],
          message: `The default must be a ${value.type}.`,
        });
      }
    }
  })
  .meta({ id: "TemplateVariableInput" });

export const TemplateVariableObject = z
  .object({
    name: z.string().meta({ description: "Used in the template as `{{name}}`." }),
    type: z.enum(TEMPLATE_VARIABLE_TYPES).meta({
      description:
        "`string`, `number`, `boolean`, or `list` (an array of objects with the declared `fields`).",
    }),
    required: z
      .boolean()
      .meta({ description: "Whether sends must pass it, unless it has a `default`." }),
    default: Scalar.optional().meta({ description: "Used when a send leaves it out." }),
    description: z
      .string()
      .optional()
      .meta({ description: "What it's for, shown in the dashboard." }),
    fields: z
      .array(
        z.object({
          name: z.string().meta({ description: "Used inside `{{#each}}` as `{{name}}`." }),
          type: z.enum(TEMPLATE_SCALAR_TYPES).meta({ description: "The field's type." }),
          required: z.boolean().meta({ description: "Whether each item must have it." }),
        }),
      )
      .optional()
      .meta({ description: "A list's item fields." }),
  })
  .meta({
    id: "TemplateVariable",
    examples: [{ name: "first_name", type: "string", required: true }],
  });

const Variables = z
  .array(TemplateVariableInput)
  .max(MAX_TEMPLATE_VARIABLES, `At most ${MAX_TEMPLATE_VARIABLES} variables are allowed.`)
  .superRefine((variables, ctx) => uniqueNames(variables, ctx, "variable"));

/**
 * A JSON object of values keyed by variable name. zod skips `__proto__` keys, which would silently
 * drop such a value, so it is refused explicitly.
 */
export const TemplateVariableValues = z
  .preprocess(
    (raw: Record<string, unknown>, ctx) => {
      if (raw !== null && typeof raw === "object" && Object.hasOwn(raw, "__proto__")) {
        ctx.addIssue({ code: "custom", path: ["__proto__"], message: "Invalid variable name." });
      }
      return raw;
    },
    z.record(z.string(), z.unknown()).superRefine((values, ctx) => {
      if (JSON.stringify(values).length > MAX_TEMPLATE_VARIABLES_BYTES) {
        ctx.addIssue({
          code: "custom",
          message: `Variables can be at most ${MAX_TEMPLATE_VARIABLES_BYTES / 1024} KB (as JSON).`,
        });
      }
    }),
  )
  .meta({ examples: [{ first_name: "Ada" }] });

export const TemplateContentInput = z
  .strictObject({
    locale: TemplateLocale.meta({
      description: "The BCP 47 language tag this content is for, unique in `contents`.",
    }),
    subject: z
      .string()
      .min(1, "Subject must not be empty.")
      .max(TEMPLATE_SOURCE_LIMITS.subject)
      .meta({ description: "The subject template." }),
    html: z
      .string()
      .max(TEMPLATE_SOURCE_LIMITS.html)
      .nullable()
      .optional()
      .meta({ description: "The HTML template. Provide `html`, `text`, or both." }),
    text: z
      .string()
      .max(TEMPLATE_SOURCE_LIMITS.text)
      .nullable()
      .optional()
      .meta({ description: "The plain-text template." }),
  })
  .superRefine((value, ctx) => {
    if (!value.html && !value.text) {
      ctx.addIssue({ code: "custom", path: ["html"], message: "Provide `html`, `text`, or both." });
    }
  })
  .transform((value) => ({
    locale: value.locale,
    subject: value.subject,
    html: value.html || null,
    text: value.text || null,
  }))
  .meta({ id: "TemplateContentInput" });

export const TemplateContentObject = z
  .object({
    locale: z.string().meta({ description: "The BCP 47 language tag this content is for." }),
    subject: z.string().meta({ description: "The subject template." }),
    html: z.string().nullable().meta({ description: "The HTML template. `null`: text only." }),
    text: z
      .string()
      .nullable()
      .meta({ description: "The plain-text template. `null`: HTML only." }),
  })
  .meta({
    id: "TemplateContent",
    examples: [
      {
        locale: "en",
        subject: "Welcome, {{first_name}}",
        html: "<p>Hi {{first_name}}, thanks for signing up!</p>",
        text: null,
      },
    ],
  });

const Contents = z
  .array(TemplateContentInput)
  .max(MAX_TEMPLATE_LOCALES, `At most ${MAX_TEMPLATE_LOCALES} locales are allowed.`)
  .superRefine((contents, ctx) => {
    const seen = new Set<string>();
    for (const [index, content] of contents.entries()) {
      const key = content.locale.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "locale"],
          message: `Duplicate locale "${content.locale}".`,
        });
      }
      seen.add(key);
    }
  });

type DraftFields = {
  default_locale?: string | undefined;
  contents?: { locale: string }[] | undefined;
};

/** The default locale must be one of the contents' (when there are any). */
function checkDefaultLocale(value: DraftFields, ctx: z.RefinementCtx): void {
  if (!value.contents?.length || value.default_locale === undefined) return;
  const lower = value.default_locale.toLowerCase();
  if (!value.contents.some((content) => content.locale.toLowerCase() === lower)) {
    ctx.addIssue({
      code: "custom",
      path: ["default_locale"],
      message: "The default locale needs an entry in `contents`.",
    });
  }
}

const draftShape = {
  default_locale: TemplateLocale.optional().meta({
    description:
      "The locale sends fall back to when they ask for none, or for one without content. Defaults " +
      'to the first entry of `contents` (or "en").',
  }),
  variables: Variables.optional().meta({
    description: "The variables the template uses, with their types.",
  }),
  sample_variables: TemplateVariableValues.optional().meta({
    description: "Example values for previews and test sends in the dashboard.",
  }),
  contents: Contents.optional().meta({
    description: "The subject, HTML and text per locale.",
  }),
};

function draftValues(value: {
  default_locale?: string | undefined;
  variables?: z.output<typeof Variables> | undefined;
  sample_variables?: Record<string, unknown> | undefined;
  contents?: z.output<typeof Contents> | undefined;
}) {
  return {
    default_locale: value.default_locale ?? value.contents?.[0]?.locale ?? "en",
    variables: value.variables ?? [],
    sample_variables: value.sample_variables ?? {},
    contents: value.contents ?? [],
  };
}

export type TemplateDraftValues = ReturnType<typeof draftValues>;

const TEMPLATE_DRAFT_EXAMPLE = {
  default_locale: "en",
  variables: [{ name: "first_name", type: "string", required: true }],
  sample_variables: { first_name: "Ada" },
  contents: [
    {
      locale: "en",
      subject: "Welcome, {{first_name}}",
      html: "<p>Hi {{first_name}}, thanks for signing up!</p>",
    },
    {
      locale: "de",
      subject: "Willkommen, {{first_name}}",
      html: "<p>Hallo {{first_name}}, danke für deine Anmeldung!</p>",
    },
  ],
};

const Alias = z
  .string()
  .regex(
    TEMPLATE_ALIAS,
    "Aliases are 1-64 lower-case letters, digits, - and _, starting with a letter or digit.",
  )
  .refine((value) => !value.startsWith("etpl_"), { error: "Aliases can't look like template ids." })
  .meta({
    description:
      "A name to send the template by instead of its id, e.g. `welcome`: the same alias can be " +
      "used in every environment.",
    examples: ["welcome"],
  });

const Name = z.string().trim().min(1, "Name must not be empty.").max(TEMPLATE_NAME_MAX_LENGTH);

export const CreateEmailTemplateRequest = z
  .strictObject({
    name: Name.meta({ description: "Shown in the dashboard." }),
    alias: Alias.optional(),
    description: z
      .string()
      .max(TEMPLATE_DESCRIPTION_MAX_LENGTH)
      .optional()
      .meta({ description: "Your note about it, shown in the dashboard." }),
    ...draftShape,
  })
  .superRefine(checkDefaultLocale)
  .transform((value) => ({
    name: value.name,
    alias: value.alias ?? null,
    description: value.description || null,
    draft: draftValues(value),
  }))
  .meta({
    id: "CreateEmailTemplateRequest",
    description: "Creates the template and its draft. Publish the draft to send it.",
    examples: [{ name: "Welcome", alias: "welcome", ...TEMPLATE_DRAFT_EXAMPLE }],
  });

export type CreateEmailTemplateRequestInput = z.input<typeof CreateEmailTemplateRequest>;
export type CreateEmailTemplateRequestOutput = z.output<typeof CreateEmailTemplateRequest>;

export const UpdateEmailTemplateRequest = z
  .strictObject({
    name: Name.optional().meta({ description: "Shown in the dashboard." }),
    alias: z.union([Alias, z.null()]).optional().meta({ description: "`null` removes the alias." }),
    description: z
      .union([z.string().max(TEMPLATE_DESCRIPTION_MAX_LENGTH), z.null()])
      .optional()
      .meta({ description: "Your note about it. `null` removes it." }),
  })
  .refine((value) => Object.keys(value).length > 0, { error: "Nothing to update." })
  .meta({
    id: "UpdateEmailTemplateRequest",
    description:
      "Changes the template's name, alias or description. Content changes go to the draft.",
    examples: [{ name: "Welcome (new users)" }],
  });

export type UpdateEmailTemplateRequestInput = z.input<typeof UpdateEmailTemplateRequest>;
export type UpdateEmailTemplateRequestOutput = z.output<typeof UpdateEmailTemplateRequest>;

const Revision = z
  .number()
  .int()
  .min(1)
  .optional()
  .meta({
    description:
      "The draft `revision` you read. When given, the request is refused " +
      "(`template_revision_mismatch`) if the draft changed since.",
  });

export const UpdateEmailTemplateDraftRequest = z
  .strictObject({ revision: Revision, ...draftShape })
  .superRefine(checkDefaultLocale)
  .transform((value) => ({ revision: value.revision, ...draftValues(value) }))
  .meta({
    id: "UpdateEmailTemplateDraftRequest",
    description:
      "Replaces the whole draft: fields left out are emptied (`default_locale` falls back to the " +
      "first locale).",
    examples: [{ revision: 3, ...TEMPLATE_DRAFT_EXAMPLE }],
  });

export type UpdateEmailTemplateDraftRequestInput = z.input<typeof UpdateEmailTemplateDraftRequest>;
export type UpdateEmailTemplateDraftRequestOutput = z.output<
  typeof UpdateEmailTemplateDraftRequest
>;

export const PublishEmailTemplateRequest = z
  .strictObject({ revision: Revision })
  .meta({ id: "PublishEmailTemplateRequest", examples: [{ revision: 3 }] });

export type PublishEmailTemplateRequestInput = z.input<typeof PublishEmailTemplateRequest>;

export const ListEmailTemplatesQuery = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_TEMPLATE_LIST_LIMIT)
    .optional()
    .meta({ description: `1-${MAX_TEMPLATE_LIST_LIMIT}, default ${DEFAULT_TEMPLATE_LIST_LIMIT}.` }),
  after: z
    .string()
    .optional()
    .meta({ description: "Cursor: the `id` of the last template of the previous page." }),
});

export const ListEmailTemplateVersionsQuery = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_TEMPLATE_VERSION_LIST_LIMIT)
    .optional()
    .meta({
      description: `1-${MAX_TEMPLATE_VERSION_LIST_LIMIT}, default ${DEFAULT_TEMPLATE_VERSION_LIST_LIMIT}.`,
    }),
  after: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .meta({ description: "Cursor: the `version` of the last version of the previous page." }),
});

export const EmailTemplateIdParams = z.object({
  id: z.string().meta({
    description: "The template's id or alias.",
    examples: [TEMPLATE_ID_EXAMPLE],
  }),
});

export const EmailTemplateVersionParams = EmailTemplateIdParams.extend({
  version: z.coerce
    .number()
    .int()
    .min(1)
    .meta({ description: "A published version number.", examples: [1] }),
});

const TEMPLATE_EXAMPLE = {
  object: "email_template",
  id: TEMPLATE_ID_EXAMPLE,
  alias: "welcome",
  name: "Welcome",
  // A string: `description: null` in an example trips fumadocs-openapi's example types.
  description: "Sent after sign-up.",
  published_version: 2,
  published_at: "2026-10-10T12:00:00.000Z",
  has_unpublished_changes: false,
  created_at: "2026-10-01T09:00:00.000Z",
  updated_at: "2026-10-10T12:00:00.000Z",
} as const;

export const EmailTemplateObject = z
  .object({
    object: z.literal("email_template"),
    id: z.string().meta({ examples: [TEMPLATE_ID_EXAMPLE] }),
    alias: z
      .string()
      .nullable()
      .meta({ description: "A name to send the template by instead of its id. `null`: none." }),
    name: z.string().meta({ description: "Shown in the dashboard." }),
    description: z.string().nullable().meta({ description: "Your note about it. `null`: none." }),
    published_version: z
      .number()
      .int()
      .nullable()
      .meta({ description: "The version sends use; `null` until the draft is first published." }),
    published_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When the published version was published. `null`: never." }),
    has_unpublished_changes: z
      .boolean()
      .meta({ description: "Whether the draft was changed since it was last published." }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "EmailTemplate", examples: [TEMPLATE_EXAMPLE] });

export type EmailTemplateObjectOutput = z.output<typeof EmailTemplateObject>;

export const EmailTemplateList = z
  .object({
    object: z.literal("list"),
    data: z.array(EmailTemplateObject),
    has_more: z.boolean(),
  })
  .meta({
    id: "EmailTemplateList",
    examples: [{ object: "list", data: [TEMPLATE_EXAMPLE], has_more: false }],
  });

export type EmailTemplateListOutput = z.output<typeof EmailTemplateList>;

export const TemplateProblemObject = z
  .object({
    locale: z.string().meta({ description: "The locale whose content it's in." }),
    field: z.enum(TEMPLATE_FIELDS).meta({ description: "The part of the content it's in." }),
    message: z.string().meta({ description: "What's wrong." }),
    line: z.number().int().meta({ description: "The line it's on, from 1." }),
    column: z.number().int().meta({ description: "The column it's at, from 1." }),
  })
  .meta({ id: "TemplateProblem" });

const VERSION_EXAMPLE = {
  object: "email_template_version",
  template_id: TEMPLATE_ID_EXAMPLE,
  version: 2,
  revision: 3,
  default_locale: "en",
  variables: [{ name: "first_name", type: "string", required: true }],
  sample_variables: { first_name: "Ada" },
  contents: [
    {
      locale: "en",
      subject: "Welcome, {{first_name}}",
      html: "<p>Hi {{first_name}}, thanks for signing up!</p>",
      text: null,
    },
  ],
  problems: [],
  published_at: "2026-10-10T12:00:00.000Z",
  created_at: "2026-10-10T12:00:00.000Z",
  updated_at: "2026-10-10T12:00:00.000Z",
} as const;

export const EmailTemplateVersionObject = z
  .object({
    object: z.literal("email_template_version"),
    template_id: z.string().meta({ description: "The template's id." }),
    version: z
      .number()
      .int()
      .nullable()
      .meta({ description: "The version number; `null` for the draft." }),
    revision: z.number().int().meta({
      description:
        "Counts the draft's saves. A published version keeps the revision it was published from.",
    }),
    default_locale: z.string().meta({
      description:
        "The locale sends fall back to when they ask for none, or for one without content.",
    }),
    variables: z
      .array(TemplateVariableObject)
      .meta({ description: "The variables the template uses, with their types." }),
    sample_variables: z
      .record(z.string(), z.unknown())
      .meta({ description: "Example values for previews and test sends in the dashboard." }),
    contents: z
      .array(TemplateContentObject)
      .meta({ description: "The subject, HTML and text per locale." }),
    problems: z.array(TemplateProblemObject).meta({
      description:
        "Syntax errors and undeclared variables per locale and field, which keep a draft from " +
        "being published. Always empty for published versions.",
    }),
    published_at: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When this version was published. `null` for the draft." }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "EmailTemplateVersion", examples: [VERSION_EXAMPLE] });

export type EmailTemplateVersionObjectOutput = z.output<typeof EmailTemplateVersionObject>;

export const EmailTemplateVersionList = z
  .object({
    object: z.literal("list"),
    data: z.array(EmailTemplateVersionObject),
    has_more: z.boolean(),
  })
  .meta({
    id: "EmailTemplateVersionList",
    examples: [{ object: "list", data: [VERSION_EXAMPLE], has_more: false }],
  });

export type EmailTemplateVersionListOutput = z.output<typeof EmailTemplateVersionList>;

export const DeletedEmailTemplate = z
  .object({
    object: z.literal("email_template"),
    id: z.string(),
    deleted: z.literal(true),
  })
  .meta({
    id: "DeletedEmailTemplate",
    examples: [{ object: "email_template", id: TEMPLATE_ID_EXAMPLE, deleted: true }],
  });

export type DeletedEmailTemplateOutput = z.output<typeof DeletedEmailTemplate>;

export const RenderEmailTemplateRequest = z
  .strictObject({
    version: z
      .number()
      .int()
      .min(1)
      .optional()
      .meta({ description: "A published version to render. Default: the draft." }),
    locale: TemplateLocale.optional().meta({
      description:
        'The locale to render, e.g. "pt-BR". Falls back to the language ("pt"), then to the ' +
        "default locale, as sends do.",
    }),
    variables: TemplateVariableValues.optional().meta({
      description:
        "Values by variable name, checked as a send checks them. Default: `sample_variables`.",
    }),
  })
  .meta({
    id: "RenderEmailTemplateRequest",
    description: "What to render: nothing is sent or stored.",
    examples: [{ locale: "en", variables: { first_name: "Ada" } }],
  });

export type RenderEmailTemplateRequestInput = z.input<typeof RenderEmailTemplateRequest>;

export const RenderedEmailTemplateObject = z
  .object({
    object: z.literal("email_template_render"),
    template_id: z.string().meta({ description: "The template's id." }),
    version: z
      .number()
      .int()
      .nullable()
      .meta({ description: "The version rendered; `null` for the draft." }),
    locale: z.string().meta({ description: "The locale rendered." }),
    subject: z.string().meta({ description: "The rendered subject." }),
    html: z
      .string()
      .nullable()
      .meta({ description: "The rendered HTML. `null`: the template has none." }),
    text: z
      .string()
      .nullable()
      .meta({ description: "The rendered plain text. `null`: the template has none." }),
  })
  .meta({
    id: "RenderedEmailTemplate",
    examples: [
      {
        object: "email_template_render",
        template_id: TEMPLATE_ID_EXAMPLE,
        version: null,
        locale: "en",
        subject: "Welcome, Ada",
        html: "<p>Hi Ada, thanks for signing up!</p>",
        text: null,
      },
    ],
  });

export type RenderedEmailTemplateObjectOutput = z.output<typeof RenderedEmailTemplateObject>;

/** The template an email was rendered from (`Email.template`). */
export const EmailTemplateReference = z
  .object({
    id: z.string().meta({ description: "The template's id." }),
    version: z
      .number()
      .int()
      .nullable()
      .meta({ description: "`null` for a dashboard test send of the draft." }),
    locale: z.string().meta({ description: "The locale the email was rendered in." }),
  })
  .meta({
    id: "EmailTemplateReference",
    examples: [{ id: TEMPLATE_ID_EXAMPLE, version: 2, locale: "en" }],
  });
