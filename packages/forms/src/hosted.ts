/**
 * Hosted form pages (`GET <forms host>/f/<id>` when `hosted.enabled`): the form rendered from its
 * fields as plain HTML, posting to its own endpoint. No JavaScript of coss.com's; the captcha
 * widget's script is the only one, from its provider's origin (the page's CSP names it). Refused
 * on save: pages without fields and fields asking for credentials (`checkHosted` in forms.ts);
 * in live environments the page's text is screened when it is published (`screenHostedPage`).
 */

import { isHipaaMode } from "@coss/compliance";
import { db, schema } from "@coss/db";
import { ID_PREFIXES, isId } from "@coss/db/id";
import type { FormFieldDefinition } from "@coss/db/schema";
import { classifyContent, type RiskDeps, resolveRiskSettings } from "@coss/risk";
import { and, eq, exists, sql } from "drizzle-orm";
import { type FormRow, filesOf, hostedOf } from "./forms.ts";
import { escapeHtml, page } from "./pages.ts";
import type { FieldError } from "./parse.ts";

const { environment, form, organizationDeletion, organizationSuspension } = schema;

/** The control field hosted pages post, so a refused post re-renders the page with its errors. */
export const HOSTED_MARKER_FIELD = "_hosted";

export type CaptchaWidget = { provider: "turnstile" | "hcaptcha"; siteKey: string };

/**
 * Script and frame origins of each captcha widget (the page's CSP allows only these). hCaptcha's
 * loader pulls in more scripts from its asset hosts, without the page's nonce: its documented
 * origins are `hcaptcha.com` and `*.hcaptcha.com` for scripts as for frames.
 */
export const CAPTCHA_ORIGINS: Record<
  CaptchaWidget["provider"],
  { script: string[]; frame: string[] }
> = {
  turnstile: {
    script: ["https://challenges.cloudflare.com"],
    frame: ["https://challenges.cloudflare.com"],
  },
  hcaptcha: {
    script: ["https://hcaptcha.com", "https://*.hcaptcha.com"],
    frame: ["https://hcaptcha.com", "https://*.hcaptcha.com"],
  },
};

export type HostedForm = { form: FormRow; captcha: CaptchaWidget | null };

/** A published hosted page that accepts submissions, or `null` (unknown, off, or not accepting). */
export async function getHostedForm(formId: string): Promise<HostedForm | null> {
  if (!isId(ID_PREFIXES.form, formId)) return null;
  const [row] = await db
    .select({ form })
    .from(form)
    .innerJoin(
      environment,
      and(
        eq(environment.id, form.environmentId),
        eq(environment.organizationId, form.organizationId),
      ),
    )
    .where(
      and(
        eq(form.id, formId),
        eq(form.enabled, true),
        sql`${form.disabledByAdminAt} is null`,
        sql`${form.hostedPublishedAt} is not null`,
        sql`not ${exists(
          db
            .select({ id: organizationSuspension.organizationId })
            .from(organizationSuspension)
            .where(eq(organizationSuspension.organizationId, form.organizationId)),
        )}`,
        sql`not ${exists(
          db
            .select({ id: organizationDeletion.id })
            .from(organizationDeletion)
            .where(
              and(
                eq(organizationDeletion.organizationId, form.organizationId),
                eq(organizationDeletion.status, "pending"),
              ),
            ),
        )}`,
      ),
    )
    .limit(1);
  if (!row || !hostedOf(row.form).enabled || !row.form.fields) return null;
  let captcha: CaptchaWidget | null = null;
  if (row.form.captcha === "required" && row.form.captchaSiteKey) {
    const risk = await resolveRiskSettings(db, row.form);
    if (risk.captcha)
      captcha = { provider: risk.captcha.provider, siteKey: row.form.captchaSiteKey };
  }
  return { form: row.form, captcha };
}

function inputFor(
  field: FormFieldDefinition,
  values: string[],
  error: FieldError | undefined,
): string {
  const id = `field-${field.name.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const name = escapeHtml(field.name);
  const required = field.required ? " required" : "";
  const invalid = error ? ` aria-invalid="true" aria-describedby="${id}-error"` : "";
  const value = values[0] ?? "";
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
  const maxLength = field.maxLength ? ` maxlength="${field.maxLength}"` : "";
  const label = escapeHtml(field.label ?? field.name);
  const marker = field.required ? ' <span class="required">(required)</span>' : "";
  const errorText = error
    ? `<span class="errors" id="${id}-error">${escapeHtml(error.message)}</span>`
    : "";
  if (field.type === "hidden")
    return `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  if (field.type === "radio" || (field.type === "checkbox" && field.options.length > 0)) {
    const choices = field.options
      .map(
        (option, index) =>
          `<label class="choice"><input type="${field.type}" name="${name}" value="${escapeHtml(option)}"` +
          `${values.includes(option) ? " checked" : ""}${field.type === "radio" && field.required && index === 0 ? " required" : ""}>` +
          `${escapeHtml(option)}</label>`,
      )
      .join("");
    return `<fieldset class="field"><legend><span>${label}${marker}</span></legend>${choices}${errorText}</fieldset>`;
  }
  if (field.type === "checkbox") {
    return (
      `<label class="field choice"><input type="checkbox" name="${name}" value="on"${values.length > 0 ? " checked" : ""}${required}${invalid}>` +
      `${label}${marker}</label>${errorText}`
    );
  }
  let control: string;
  if (field.type === "textarea") {
    control = `<textarea id="${id}" name="${name}"${placeholder}${maxLength}${required}${invalid}>${escapeHtml(value)}</textarea>`;
  } else if (field.type === "select") {
    control =
      `<select id="${id}" name="${name}"${required}${invalid}><option value="">Choose…</option>` +
      field.options
        .map(
          (option) =>
            `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`,
        )
        .join("") +
      "</select>";
  } else if (field.type === "file") {
    control = `<input id="${id}" type="file" name="${name}"${required}${invalid}>`;
  } else {
    const autocomplete = field.type === "email" ? ' autocomplete="email"' : "";
    // Any finite number, as the endpoint accepts (the browser's default step is 1).
    const step = field.type === "number" ? ' step="any"' : "";
    control = `<input id="${id}" type="${field.type}" name="${name}" value="${escapeHtml(value)}"${placeholder}${maxLength}${step}${autocomplete}${required}${invalid}>`;
  }
  return `<label class="field" for="${id}"><span>${label}${marker}</span>${control}${errorText}</label>`;
}

/** The hosted page; after a refused post, with what was entered and what to fix. */
export function hostedFormPage(input: {
  hosted: HostedForm;
  action: string;
  nonce: string;
  values?: ReadonlyMap<string, string[]>;
  errors?: FieldError[];
}): string {
  const { form: row, captcha } = input.hosted;
  const hosted = hostedOf(row);
  const fields = row.fields ?? [];
  const errors = input.errors ?? [];
  const byField = new Map(
    errors.filter((error) => error.field).map((error) => [error.field, error]),
  );
  const general = errors.filter(
    (error) => !error.field || !fields.some((f) => f.name === error.field),
  );
  const multipart = fields.some((field) => field.type === "file") && filesOf(row).enabled;
  const widget = captcha
    ? captcha.provider === "turnstile"
      ? `<div class="cf-turnstile field" data-sitekey="${escapeHtml(captcha.siteKey)}"></div>`
      : `<div class="h-captcha field" data-sitekey="${escapeHtml(captcha.siteKey)}"></div>`
    : "";
  const head = captcha
    ? `<script src="${
        captcha.provider === "turnstile"
          ? "https://challenges.cloudflare.com/turnstile/v0/api.js"
          : "https://js.hcaptcha.com/1/api.js"
      }" async defer nonce="${escapeHtml(input.nonce)}"></script>`
    : "";
  const body =
    `<h1>${escapeHtml(hosted.title ?? row.name)}</h1>` +
    (hosted.description
      ? `<p class="muted">${escapeHtml(hosted.description).replace(/\n/g, "<br>")}</p>`
      : "") +
    (general.length > 0
      ? `<ul class="errors" role="alert">${general.map((error) => `<li>${escapeHtml(error.message)}</li>`).join("")}</ul>`
      : "") +
    `<form method="post" action="${escapeHtml(input.action)}"${multipart ? ' enctype="multipart/form-data"' : ""}>` +
    `<input type="hidden" name="${HOSTED_MARKER_FIELD}" value="1">` +
    // The honeypot: hidden from people (and screen readers), filled by bots.
    `<div class="hidden" aria-hidden="true"><label>Leave this empty <input type="text" name="${escapeHtml(row.honeypotField)}" tabindex="-1" autocomplete="off"></label></div>` +
    fields
      .map((field) => inputFor(field, input.values?.get(field.name) ?? [], byField.get(field.name)))
      .join("") +
    widget +
    `<p><button type="submit">${escapeHtml(hosted.submitLabel ?? "Submit")}</button></p>` +
    "</form>";
  return page({ title: hosted.title ?? row.name, nonce: input.nonce, body, head });
}

/**
 * The page's `Content-Security-Policy`: its nonce'd style (and the captcha's script), posts to
 * itself, and framing only by the form's allowed origins.
 */
export function hostedPageCsp(input: {
  nonce: string;
  captcha: CaptchaWidget | null;
  allowedOrigins: readonly string[];
  redirectOrigins: readonly string[];
}): string {
  const captcha = input.captcha ? CAPTCHA_ORIGINS[input.captcha.provider] : null;
  return [
    "default-src 'none'",
    `style-src 'nonce-${input.nonce}'${input.captcha?.provider === "hcaptcha" ? ` ${captcha?.frame.join(" ")}` : ""}`,
    captcha ? `script-src 'nonce-${input.nonce}' ${captcha.script.join(" ")}` : null,
    captcha ? `frame-src ${captcha.frame.join(" ")}` : null,
    captcha ? `connect-src ${[...new Set([...captcha.script, ...captcha.frame])].join(" ")}` : null,
    `form-action 'self'${input.redirectOrigins.map((origin) => ` ${origin}`).join("")}`,
    `frame-ancestors ${input.allowedOrigins.length > 0 ? input.allowedOrigins.join(" ") : "'none'"}`,
    "base-uri 'none'",
  ]
    .filter(Boolean)
    .join("; ");
}

/** The text a hosted page shows, for screening when it is published. */
export function hostedPageText(row: Pick<FormRow, "name" | "fields" | "hosted">): string {
  const hosted = hostedOf(row);
  return [
    hosted.title ?? row.name,
    hosted.description,
    hosted.submitLabel,
    hosted.successMessage,
    ...(row.fields ?? []).flatMap((field) => [
      field.label ?? field.name,
      field.placeholder,
      ...field.options,
    ]),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

/** A live page scoring at least this in a content category isn't published. */
export const HOSTED_PAGE_REFUSAL_SCORE = 0.9;

/**
 * `FormChecks.screenHostedPage` through Risk's content classification, charged to the
 * organization's classification budget like any. Fails open when classification is unavailable
 * or the budget is spent: admins can still disable a form.
 */
export function hostedPageScreening(
  riskDeps: RiskDeps,
): (input: { organizationId: string; text: string }) => Promise<boolean> {
  return async ({ organizationId, text }) => {
    if (await isHipaaMode(organizationId)) return true;
    try {
      if (riskDeps.chargeClassification && !(await riskDeps.chargeClassification(organizationId))) {
        console.warn(
          `[forms] classification budget spent: a hosted page of ${organizationId} wasn't screened`,
        );
        return true;
      }
      const { scores } = await classifyContent(riskDeps, { organizationId, mode: "live" }, text);
      return Math.max(...Object.values(scores)) < HOSTED_PAGE_REFUSAL_SCORE;
    } catch (error) {
      console.error("[forms] couldn't screen a hosted page:", error);
      return true;
    }
  };
}
