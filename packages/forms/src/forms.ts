/**
 * Forms: an environment's hosted form endpoints and their settings. Every function takes the
 * environment and scopes its SQL by the organization (tenancy rule).
 */
import { db, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import type {
  FormContactsConfig,
  FormFieldDefinition,
  FormFilesConfig,
  FormHostedConfig,
} from "@coss/db/schema";
import { withoutTrailingSlashes } from "@coss/db/url";
import { resolveRiskSettings } from "@coss/risk";
import { and, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { FormError } from "./errors.ts";
import { hostedPageText } from "./hosted.ts";
import {
  BLOCKED_FORM_FILE_TYPES,
  type CreateFormRequestOutput,
  DEFAULT_FORM_LIST_LIMIT,
  DEFAULT_FORM_MAX_FILES,
  FORBIDDEN_HOSTED_FIELD_PATTERN,
  FORM_CHOICE_FIELD_TYPES,
  type FormFieldInputOutput,
  type FormObjectOutput,
  MAX_FORM_CONTACT_PROPERTIES,
  MAX_FORM_FILE_BYTES,
  MAX_FORM_LIST_LIMIT,
  MAX_FORMS_PER_ENVIRONMENT,
  RESERVED_FORM_FIELD_NAMES,
  type UpdateFormRequestOutput,
} from "./schemas.ts";
import type { FormFileStore } from "./store.ts";
import { removeStoreObjects, scheduleStoreCleanup } from "./store-cleanup.ts";

const {
  audience,
  contactProperty,
  environment,
  form,
  formSubmission,
  formSubmissionFile,
  marketingSettings,
  member,
  topic,
  user,
} = schema;

export type FormRow = typeof form.$inferSelect;

export type FormEnvironment = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  mode: "live" | "sandbox";
};

/**
 * Checks the app injects (they need `@coss/email`, which Forms must not import): is this address
 * on a domain the organization verified with the live provider? Only asked in live environments.
 */
export type FormChecks = {
  verifiedAddress(input: { organizationId: string; address: string }): Promise<boolean>;
  /**
   * Screens a live hosted page's text when it is published (Risk's content classification):
   * false refuses it (phishing). Absent, or unable to classify: published.
   */
  screenHostedPage?(input: { organizationId: string; text: string }): Promise<boolean>;
};

/** Where forms are served (`FORMS_PUBLIC_URL`), for the object's `endpoint` and `hosted_url`. */
export type FormLinks = { publicUrl: string };

export const DEFAULT_CONTACTS: FormContactsConfig = {
  enabled: false,
  audienceIds: [],
  topics: [],
  doubleOptIn: null,
  firstNameField: null,
  lastNameField: null,
  properties: {},
};

export const DEFAULT_FILES: FormFilesConfig = {
  enabled: false,
  maxFiles: DEFAULT_FORM_MAX_FILES,
  maxFileBytes: MAX_FORM_FILE_BYTES,
  allowedTypes: [],
};

export const DEFAULT_HOSTED: FormHostedConfig = {
  enabled: false,
  title: null,
  description: null,
  submitLabel: null,
  successMessage: null,
};

export function contactsOf(row: Pick<FormRow, "contacts">): FormContactsConfig {
  return { ...DEFAULT_CONTACTS, ...row.contacts };
}

export function filesOf(row: Pick<FormRow, "files">): FormFilesConfig {
  return { ...DEFAULT_FILES, ...row.files };
}

export function hostedOf(row: Pick<FormRow, "hosted">): FormHostedConfig {
  return { ...DEFAULT_HOSTED, ...row.hosted };
}

export function formEndpoint(links: FormLinks, formId: string): string {
  return `${withoutTrailingSlashes(links.publicUrl)}/f/${formId}`;
}

export function toFormObject(
  row: FormRow,
  input: { links: FormLinks; sandbox: boolean },
): FormObjectOutput {
  const contacts = contactsOf(row);
  const files = filesOf(row);
  const hosted = hostedOf(row);
  const endpoint = formEndpoint(input.links, row.id);
  return {
    object: "form",
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    endpoint,
    hosted_url: hosted.enabled ? endpoint : null,
    fields:
      row.fields?.map((field) => ({
        name: field.name,
        type: field.type,
        label: field.label,
        required: field.required,
        placeholder: field.placeholder,
        options: field.options,
        max_length: field.maxLength,
      })) ?? null,
    strict_fields: row.strictFields,
    allowed_origins: row.allowedOrigins,
    redirect_url: row.redirectUrl,
    spam: {
      honeypot_field: row.honeypotField,
      captcha: row.captcha,
      captcha_site_key: row.captchaSiteKey,
      content_threshold: row.contentThreshold,
      on_review: row.onReview,
    },
    submitter: {
      email_field: row.emailField,
      verify: row.verifySubmitter,
      confirmation_from: row.confirmationFrom,
    },
    notifications: { recipients: row.notifyRecipients, from: row.notificationFrom },
    contacts: {
      enabled: contacts.enabled,
      audience_ids: contacts.audienceIds,
      topics: contacts.topics,
      double_opt_in: contacts.doubleOptIn,
      first_name_field: contacts.firstNameField,
      last_name_field: contacts.lastNameField,
      properties: contacts.properties,
    },
    files: {
      enabled: files.enabled,
      max_files: files.maxFiles,
      max_file_bytes: files.maxFileBytes,
      allowed_types: files.allowedTypes,
    },
    hosted: {
      enabled: hosted.enabled,
      title: hosted.title,
      description: hosted.description,
      submit_label: hosted.submitLabel,
      success_message: hosted.successMessage,
      published_at: row.hostedPublishedAt?.toISOString() ?? null,
    },
    disabled_by_admin: row.disabledByAdminAt !== null,
    sandbox: input.sandbox,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/**
 * Normalizes an origin allowed to post to a form: `https://host[:port]` only; `http://localhost`
 * and `http://127.0.0.1` too in sandbox environments.
 */
export function checkedFormOrigin(value: string, mode: "live" | "sandbox"): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new FormError("invalid_origin", `${value} is not a URL like https://www.example.com.`, {
      param: "allowed_origins",
    });
  }
  if (!allowedScheme(url, mode) || url.username || url.password || url.origin === "null") {
    throw new FormError(
      "invalid_origin",
      mode === "sandbox"
        ? `${value} must be an https:// origin (or http://localhost).`
        : `${value} must be an https:// origin.`,
      { param: "allowed_origins" },
    );
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new FormError("invalid_origin", `${value} must be an origin, without a path.`, {
      param: "allowed_origins",
    });
  }
  return url.origin;
}

function allowedScheme(url: URL, mode: "live" | "sandbox"): boolean {
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return url.protocol === "https:" || (url.protocol === "http:" && local && mode === "sandbox");
}

function checkedRedirect(value: string, mode: "live" | "sandbox"): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FormError("invalid_redirect", "redirect_url must be a URL.", {
      param: "redirect_url",
    });
  }
  if (!allowedScheme(url, mode) || url.username || url.password) {
    throw new FormError(
      "invalid_redirect",
      mode === "sandbox"
        ? "redirect_url must be an https:// URL (or http://localhost)."
        : "redirect_url must be an https:// URL.",
      { param: "redirect_url" },
    );
  }
  return url.toString();
}

/** A form's field definitions from the request: names unique, options where they belong. */
export function normalizeFields(
  input: FormFieldInputOutput[] | null,
  files: FormFilesConfig,
): FormFieldDefinition[] | null {
  if (input === null) return null;
  const seen = new Set<string>();
  return input.map((field, index) => {
    const param = `fields[${index}]`;
    if (seen.has(field.name)) {
      throw new FormError("invalid_fields", `Two fields are named ${field.name}.`, {
        param: `${param}.name`,
      });
    }
    seen.add(field.name);
    const options = field.options ?? [];
    const choice = FORM_CHOICE_FIELD_TYPES.includes(field.type);
    if (choice && options.length === 0) {
      throw new FormError("invalid_fields", `A ${field.type} field needs options.`, {
        param: `${param}.options`,
      });
    }
    if (!choice && field.type !== "checkbox" && options.length > 0) {
      throw new FormError("invalid_fields", `A ${field.type} field takes no options.`, {
        param: `${param}.options`,
      });
    }
    if (new Set(options).size !== options.length) {
      throw new FormError("invalid_fields", "Options must be unique.", {
        param: `${param}.options`,
      });
    }
    if (field.type === "file" && !files.enabled) {
      throw new FormError("invalid_fields", "A file field needs uploads on (files.enabled).", {
        param: `${param}.type`,
      });
    }
    return {
      name: field.name,
      type: field.type,
      label: field.label ?? null,
      required: field.required ?? false,
      placeholder: field.placeholder ?? null,
      options,
      maxLength: field.max_length ?? null,
    };
  });
}

/** Everything a create or update sets, already merged with the form's current values. */
type FormValues = Required<
  Omit<
    typeof form.$inferInsert,
    | "id"
    | "organizationId"
    | "projectId"
    | "environmentId"
    | "apiKeyId"
    | "hostedPublishedAt"
    | "disabledByAdminAt"
    | "createdAt"
    | "updatedAt"
  >
>;

function merged(
  current: FormRow | null,
  params: UpdateFormRequestOutput & { name?: string },
  mode: "live" | "sandbox",
): FormValues {
  const files: FormFilesConfig = { ...(current ? filesOf(current) : DEFAULT_FILES) };
  if (params.files) {
    const input = params.files;
    if (input.enabled !== undefined) files.enabled = input.enabled;
    if (input.max_files !== undefined) files.maxFiles = input.max_files;
    if (input.max_file_bytes !== undefined) files.maxFileBytes = input.max_file_bytes;
    if (input.allowed_types !== undefined) {
      const blocked = input.allowed_types.find((type) =>
        (BLOCKED_FORM_FILE_TYPES as readonly string[]).includes(type),
      );
      if (blocked) {
        throw new FormError("invalid_files", `${blocked} files can't be accepted.`, {
          param: "files.allowed_types",
        });
      }
      files.allowedTypes = [...new Set(input.allowed_types)];
    }
  }
  const contacts: FormContactsConfig = { ...(current ? contactsOf(current) : DEFAULT_CONTACTS) };
  if (params.contacts) {
    const input = params.contacts;
    if (input.enabled !== undefined) contacts.enabled = input.enabled;
    if (input.audience_ids !== undefined) contacts.audienceIds = [...new Set(input.audience_ids)];
    if (input.topics !== undefined) contacts.topics = [...new Set(input.topics)];
    if (input.double_opt_in !== undefined) contacts.doubleOptIn = input.double_opt_in;
    if (input.first_name_field !== undefined) contacts.firstNameField = input.first_name_field;
    if (input.last_name_field !== undefined) contacts.lastNameField = input.last_name_field;
    if (input.properties !== undefined) {
      if (Object.keys(input.properties).length > MAX_FORM_CONTACT_PROPERTIES) {
        throw new FormError(
          "invalid_contacts",
          `At most ${MAX_FORM_CONTACT_PROPERTIES} contact properties.`,
          { param: "contacts.properties" },
        );
      }
      contacts.properties = { ...input.properties };
    }
  }
  const hosted: FormHostedConfig = { ...(current ? hostedOf(current) : DEFAULT_HOSTED) };
  if (params.hosted) {
    const input = params.hosted;
    if (input.enabled !== undefined) hosted.enabled = input.enabled;
    if (input.title !== undefined) hosted.title = input.title;
    if (input.description !== undefined) hosted.description = input.description;
    if (input.submit_label !== undefined) hosted.submitLabel = input.submit_label;
    if (input.success_message !== undefined) hosted.successMessage = input.success_message;
  }
  const fields =
    params.fields !== undefined ? normalizeFields(params.fields, files) : (current?.fields ?? null);
  if (params.fields === undefined && fields?.some((field) => field.type === "file")) {
    if (!files.enabled) {
      throw new FormError("invalid_files", "The form has file fields: uploads must stay on.", {
        param: "files.enabled",
      });
    }
  }
  const origins =
    params.allowed_origins !== undefined
      ? [...new Set(params.allowed_origins.map((origin) => checkedFormOrigin(origin, mode)))]
      : (current?.allowedOrigins ?? []);
  const redirectUrl =
    params.redirect_url !== undefined
      ? params.redirect_url === null
        ? null
        : checkedRedirect(params.redirect_url, mode)
      : (current?.redirectUrl ?? null);
  return {
    name: params.name ?? current?.name ?? "",
    enabled: params.enabled ?? current?.enabled ?? true,
    fields,
    strictFields: params.strict_fields ?? current?.strictFields ?? false,
    allowedOrigins: origins,
    redirectUrl,
    honeypotField: params.spam?.honeypot_field ?? current?.honeypotField ?? "_gotcha",
    captcha: params.spam?.captcha ?? current?.captcha ?? "off",
    captchaSiteKey:
      params.spam?.captcha_site_key !== undefined
        ? params.spam.captcha_site_key
        : (current?.captchaSiteKey ?? null),
    contentThreshold:
      params.spam?.content_threshold !== undefined
        ? params.spam.content_threshold
        : current
          ? current.contentThreshold
          : 0.9,
    onReview: params.spam?.on_review ?? current?.onReview ?? "hold",
    emailField: params.submitter?.email_field ?? current?.emailField ?? "email",
    verifySubmitter: params.submitter?.verify ?? current?.verifySubmitter ?? false,
    confirmationFrom:
      params.submitter?.confirmation_from !== undefined
        ? (params.submitter.confirmation_from?.toLowerCase() ?? null)
        : (current?.confirmationFrom ?? null),
    notifyRecipients:
      params.notifications?.recipients !== undefined
        ? [...new Set(params.notifications.recipients.map((address) => address.toLowerCase()))]
        : (current?.notifyRecipients ?? []),
    notificationFrom:
      params.notifications?.from !== undefined
        ? (params.notifications.from?.toLowerCase() ?? null)
        : (current?.notificationFrom ?? null),
    contacts,
    files,
    hosted,
  };
}

/** What the values reference must exist in the environment, and senders must be verified. */
async function check(env: FormEnvironment, values: FormValues, checks: FormChecks): Promise<void> {
  const defined = values.fields ? new Set(values.fields.map((field) => field.name)) : null;
  if (defined?.has(values.honeypotField)) {
    throw new FormError("invalid_fields", "The honeypot field can't be one of the form's fields.", {
      param: "spam.honeypot_field",
    });
  }
  if ((RESERVED_FORM_FIELD_NAMES as readonly string[]).includes(values.honeypotField)) {
    throw new FormError(
      "invalid_fields",
      `${values.honeypotField} is a control field of the endpoint: pick another honeypot name.`,
      { param: "spam.honeypot_field" },
    );
  }
  if (values.captcha === "required") {
    const risk = await resolveRiskSettings(db, env);
    if (!risk.captcha) {
      throw new FormError(
        "captcha_not_configured",
        "Set up a captcha (Turnstile or hCaptcha) in this environment's risk settings first.",
        { param: "spam.captcha" },
      );
    }
  }
  if (values.contacts?.enabled) {
    await checkContacts(env, values.contacts, defined);
    await checkConfirmationSender(env, values.contacts);
  }
  if (values.hosted?.enabled) checkHosted(values);
  if (values.verifySubmitter && env.mode === "live" && !values.confirmationFrom) {
    throw new FormError(
      "invalid_sender",
      "Verifying submitters needs a confirmation_from address on a verified domain.",
      { param: "submitter.confirmation_from" },
    );
  }
  if (env.mode === "live") {
    for (const [param, address] of [
      ["submitter.confirmation_from", values.confirmationFrom],
      ["notifications.from", values.notificationFrom],
    ] as const) {
      if (!address) continue;
      if (!(await checks.verifiedAddress({ organizationId: env.organizationId, address }))) {
        throw new FormError("invalid_sender", `${address} isn't on a verified domain.`, { param });
      }
    }
    const recipients = values.notifyRecipients;
    const members = await memberAddresses(env.organizationId, recipients);
    for (const [index, address] of recipients.entries()) {
      if (members.has(address)) continue;
      if (await checks.verifiedAddress({ organizationId: env.organizationId, address })) continue;
      throw new FormError(
        "invalid_recipient",
        `${address} is neither a member of the organization nor on one of its verified domains.`,
        { param: `notifications.recipients[${index}]` },
      );
    }
  }
}

/** Which of these addresses belong to verified members of the organization (lower-cased). */
export async function memberAddresses(
  organizationId: string,
  addresses: string[],
): Promise<Set<string>> {
  if (addresses.length === 0) return new Set();
  const rows = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        inArray(sql`lower(${user.email})`, addresses),
        eq(user.emailVerified, true),
      ),
    );
  return new Set(rows.map((row) => row.email.toLowerCase()));
}

async function checkContacts(
  env: FormEnvironment,
  contacts: FormContactsConfig,
  defined: Set<string> | null,
): Promise<void> {
  const scope = (table: typeof audience | typeof topic | typeof contactProperty) =>
    and(eq(table.organizationId, env.organizationId), eq(table.environmentId, env.environmentId));
  if (contacts.audienceIds.length > 0) {
    const found = await db
      .select({ id: audience.id })
      .from(audience)
      .where(and(scope(audience), inArray(audience.id, contacts.audienceIds)));
    const ids = new Set(found.map((row) => row.id));
    const missing = contacts.audienceIds.find((id) => !ids.has(id));
    if (missing) {
      throw new FormError("invalid_contacts", `Audience ${missing} not found.`, {
        param: "contacts.audience_ids",
      });
    }
  }
  if (contacts.topics.length > 0) {
    const found = await db
      .select({ key: topic.key })
      .from(topic)
      .where(and(scope(topic), inArray(topic.key, contacts.topics)));
    const keys = new Set(found.map((row) => row.key));
    const missing = contacts.topics.find((key) => !keys.has(key));
    if (missing) {
      throw new FormError("invalid_contacts", `Topic ${missing} not found.`, {
        param: "contacts.topics",
      });
    }
  }
  const propertyKeys = Object.keys(contacts.properties);
  if (propertyKeys.length > 0) {
    const found = await db
      .select({ key: contactProperty.key })
      .from(contactProperty)
      .where(and(scope(contactProperty), inArray(contactProperty.key, propertyKeys)));
    const keys = new Set(found.map((row) => row.key));
    const missing = propertyKeys.find((key) => !keys.has(key));
    if (missing) {
      throw new FormError("invalid_contacts", `Contact property ${missing} not found.`, {
        param: "contacts.properties",
      });
    }
  }
  if (defined) {
    const mapped = [
      contacts.firstNameField,
      contacts.lastNameField,
      ...Object.values(contacts.properties),
    ];
    const unknown = mapped.find((name) => name !== null && !defined.has(name));
    if (unknown) {
      throw new FormError("invalid_contacts", `The form has no field named ${unknown}.`, {
        param: "contacts",
      });
    }
  }
}

/**
 * Double opt-in sends the environment's confirmation email, which needs its sender (the marketing
 * settings' `confirmation_from`): refused up front rather than failing every submission later.
 */
async function checkConfirmationSender(
  env: FormEnvironment,
  contacts: FormContactsConfig,
): Promise<void> {
  const [settings] = await db
    .select({
      doubleOptInDefault: marketingSettings.doubleOptInDefault,
      confirmationFrom: marketingSettings.confirmationFrom,
    })
    .from(marketingSettings)
    .where(
      and(
        eq(marketingSettings.organizationId, env.organizationId),
        eq(marketingSettings.environmentId, env.environmentId),
      ),
    )
    .limit(1);
  const doubleOptIn = contacts.doubleOptIn ?? settings?.doubleOptInDefault ?? false;
  if (doubleOptIn && !settings?.confirmationFrom) {
    throw new FormError(
      "invalid_contacts",
      "Double opt-in sends the environment's confirmation email: set its sender (confirmation_from) in the marketing settings first.",
      { param: "contacts.double_opt_in" },
    );
  }
}

/** Hosted pages need fields, and never ask for credentials or card numbers. */
function checkHosted(values: FormValues): void {
  const { fields } = values;
  if (!fields || fields.filter((field) => field.type !== "hidden").length === 0) {
    throw new FormError("hosted_needs_fields", "A hosted page needs the form's fields.", {
      param: "hosted.enabled",
    });
  }
  for (const [index, field] of fields.entries()) {
    if (
      FORBIDDEN_HOSTED_FIELD_PATTERN.test(field.name) ||
      (field.label && FORBIDDEN_HOSTED_FIELD_PATTERN.test(field.label))
    ) {
      throw new FormError(
        "hosted_content_refused",
        "Hosted pages can't ask for passwords, codes or card numbers.",
        { param: `fields[${index}]` },
      );
    }
    // Nothing on the page can fill it in, so no one could submit.
    if (field.type === "hidden" && field.required) {
      throw new FormError(
        "invalid_fields",
        "A hosted page can't fill in a required hidden field: make it optional.",
        { param: `fields[${index}].required` },
      );
    }
  }
  // A verifying form needs the address typed in: the page shows only its fields.
  const email = fields.find((field) => field.name === values.emailField);
  if (values.verifySubmitter && (!email || email.type === "hidden")) {
    throw new FormError(
      "invalid_fields",
      `Verifying submitters needs a visible ${values.emailField} field on the hosted page.`,
      { param: "submitter.email_field" },
    );
  }
  // Without the site key the page has no widget, and every post would fail the captcha.
  if (values.captcha === "required" && !values.captchaSiteKey) {
    throw new FormError(
      "captcha_not_configured",
      "A hosted page with a required captcha needs its site key.",
      { param: "spam.captcha_site_key" },
    );
  }
}

async function environmentMode(input: {
  organizationId: string;
  environmentId: string;
}): Promise<"live" | "sandbox" | null> {
  const [row] = await db
    .select({ mode: environment.mode })
    .from(environment)
    .where(
      and(
        eq(environment.id, input.environmentId),
        eq(environment.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  return row?.mode ?? null;
}

/** A live hosted page being published must pass screening (`FormChecks.screenHostedPage`). */
async function screenPublished(
  env: FormEnvironment,
  values: FormValues,
  checks: FormChecks,
): Promise<void> {
  if (env.mode !== "live" || !checks.screenHostedPage) return;
  const text = hostedPageText(values);
  if (!(await checks.screenHostedPage({ organizationId: env.organizationId, text }))) {
    throw new FormError(
      "hosted_content_refused",
      "This page's text looks like phishing or spam, so it can't be published. Contact support if that's wrong.",
      { param: "hosted" },
    );
  }
}

export async function createForm(
  env: FormEnvironment,
  params: CreateFormRequestOutput,
  opts: { links: FormLinks; apiKeyId?: string | null; checks: FormChecks; now?: Date },
): Promise<FormObjectOutput> {
  const values = merged(null, params, env.mode);
  await check(env, values, opts.checks);
  if (values.hosted?.enabled) await screenPublished(env, values, opts.checks);
  const row = await db.transaction(async (tx) => {
    // One environment's creates queue here, so two can't both pass the count.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`form:${env.environmentId}`}))`);
    const [existing] = await tx
      .select({ n: count() })
      .from(form)
      .where(
        and(eq(form.organizationId, env.organizationId), eq(form.environmentId, env.environmentId)),
      );
    if ((existing?.n ?? 0) >= MAX_FORMS_PER_ENVIRONMENT) {
      throw new FormError(
        "form_limit_reached",
        `An environment can have at most ${MAX_FORMS_PER_ENVIRONMENT} forms.`,
      );
    }
    const [inserted] = await tx
      .insert(form)
      .values({
        ...values,
        organizationId: env.organizationId,
        projectId: env.projectId,
        environmentId: env.environmentId,
        apiKeyId: opts.apiKeyId ?? null,
        hostedPublishedAt: values.hosted?.enabled ? (opts.now ?? new Date()) : null,
      })
      .returning();
    return inserted as FormRow;
  });
  return toFormObject(row, { links: opts.links, sandbox: env.mode === "sandbox" });
}

export async function getFormRow(input: {
  organizationId: string;
  environmentId: string;
  formId: string;
}): Promise<FormRow | null> {
  if (!isId(ID_PREFIXES.form, input.formId)) return null;
  const [row] = await db
    .select()
    .from(form)
    .where(
      and(
        eq(form.id, input.formId),
        eq(form.organizationId, input.organizationId),
        eq(form.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getForm(
  input: { organizationId: string; environmentId: string; formId: string },
  links: FormLinks,
): Promise<FormObjectOutput> {
  const row = await getFormRow(input);
  if (!row) throw new FormError("not_found", "Form not found.");
  const mode = await environmentMode(input);
  return toFormObject(row, { links, sandbox: mode === "sandbox" });
}

export async function listForms(
  input: { organizationId: string; environmentId: string; limit?: number; after?: string },
  links: FormLinks,
): Promise<{ data: FormObjectOutput[]; hasMore: boolean }> {
  const limit = Math.min(input.limit ?? DEFAULT_FORM_LIST_LIMIT, MAX_FORM_LIST_LIMIT);
  const base = and(
    eq(form.organizationId, input.organizationId),
    eq(form.environmentId, input.environmentId),
  );
  let cursor: SQL | undefined;
  if (input.after) {
    if (!isId(ID_PREFIXES.form, input.after)) return { data: [], hasMore: false };
    const [anchor] = await db
      .select({ id: form.id })
      .from(form)
      .where(and(base, eq(form.id, input.after)))
      .limit(1);
    if (!anchor) return { data: [], hasMore: false };
    // Compared in SQL: a JavaScript Date would cut the anchor's microseconds off.
    cursor = sql`(${form.createdAt}, ${form.id}) < (select ${form.createdAt}, ${form.id} from ${form} where ${form.id} = ${anchor.id})`;
  }
  const rows = await db
    .select()
    .from(form)
    .where(and(base, cursor))
    .orderBy(desc(form.createdAt), desc(form.id))
    .limit(limit + 1);
  const sandbox = (await environmentMode(input)) === "sandbox";
  return {
    data: rows.slice(0, limit).map((row) => toFormObject(row, { links, sandbox })),
    hasMore: rows.length > limit,
  };
}

/** Retries of an update that raced another one before it answers `form_conflict`. */
const MAX_UPDATE_ATTEMPTS = 3;

export async function updateForm(
  env: FormEnvironment,
  formId: string,
  params: UpdateFormRequestOutput,
  opts: { links: FormLinks; checks: FormChecks; now?: Date },
): Promise<FormObjectOutput> {
  // Checked outside the transaction (lookups and screening), then written only if the row is
  // still what the patch was merged into: concurrent partial updates never undo each other.
  for (let attempt = 1; ; attempt++) {
    const current = await getFormRow({ ...env, formId });
    if (!current) throw new FormError("not_found", "Form not found.");
    const values = merged(current, params, env.mode);
    await check(env, values, opts.checks);
    const hosted = hostedOf(values);
    // Republished whenever the page is on and something it shows changed.
    const republished =
      hosted.enabled &&
      (!hostedOf(current).enabled ||
        params.hosted !== undefined ||
        params.fields !== undefined ||
        params.name !== undefined);
    if (republished) await screenPublished(env, values, opts.checks);
    const row = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(form)
        .where(and(eq(form.id, current.id), eq(form.organizationId, env.organizationId)))
        .for("update");
      if (!locked) throw new FormError("not_found", "Form not found.");
      if (JSON.stringify(locked) !== JSON.stringify(current)) return null;
      const [row] = await tx
        .update(form)
        .set({
          ...values,
          hostedPublishedAt: !hosted.enabled
            ? null
            : republished
              ? (opts.now ?? new Date())
              : current.hostedPublishedAt,
        })
        .where(and(eq(form.id, current.id), eq(form.organizationId, env.organizationId)))
        .returning();
      return row ?? null;
    });
    if (row) return toFormObject(row, { links: opts.links, sandbox: env.mode === "sandbox" });
    if (attempt === MAX_UPDATE_ATTEMPTS) {
      throw new FormError(
        "form_conflict",
        "The form changed while it was being updated. Try again.",
      );
    }
  }
}

/**
 * Deletes the form with its submissions. Their files are recorded for cleanup in the same
 * transaction and leave the store after the commit (the worker retries a failed deletion).
 */
export async function deleteForm(
  input: { organizationId: string; environmentId: string; formId: string },
  store: FormFileStore | null,
): Promise<void> {
  const current = await getFormRow(input);
  if (!current) throw new FormError("not_found", "Form not found.");
  const keys = await db.transaction(async (tx) => {
    // Locked first: a submission being stored holds a key-share lock on the form (its foreign
    // key), so it either commits before the files are listed or waits and fails after the delete.
    await tx
      .select({ id: form.id })
      .from(form)
      .where(and(eq(form.id, current.id), eq(form.organizationId, input.organizationId)))
      .for("update");
    const files = await tx
      .select({ key: formSubmissionFile.storeKey })
      .from(formSubmissionFile)
      .innerJoin(
        formSubmission,
        and(
          eq(formSubmission.id, formSubmissionFile.submissionId),
          eq(formSubmission.organizationId, formSubmissionFile.organizationId),
        ),
      )
      .where(
        and(
          eq(formSubmission.formId, current.id),
          eq(formSubmission.organizationId, input.organizationId),
        ),
      );
    const keys = files.map((file) => file.key);
    await scheduleStoreCleanup(tx, input.organizationId, keys);
    await tx
      .delete(form)
      .where(and(eq(form.id, current.id), eq(form.organizationId, input.organizationId)));
    return keys;
  });
  if (store) await removeStoreObjects(store, keys);
}
