import type { EmailTemplateVersion, TemplateContent, TemplateContentParams } from "coss";
import { z } from "zod";
import { fail, ok, respond, run, truncate, unwrap } from "../result.ts";
import {
  compact,
  cursorSchema,
  given,
  limitSchema,
  nextCursor,
  READ_ONLY,
  type ToolContext,
  WRITE,
} from "./shared.ts";

function contentSummary(content: TemplateContent): object {
  return compact({
    locale: content.locale,
    subject: content.subject,
    html: truncate(content.html),
    text: truncate(content.text),
  });
}

function draftSummary(draft: EmailTemplateVersion): object {
  return compact({
    template_id: draft.template_id,
    revision: draft.revision,
    default_locale: draft.default_locale,
    contents: draft.contents.map(contentSummary),
    problems: draft.problems,
  });
}

function withLocale(
  contents: TemplateContent[],
  locale: string,
  patch: { subject: string; html?: string; text?: string },
): TemplateContentParams[] {
  const next = contents.map((content) =>
    content.locale === locale
      ? {
          locale,
          subject: patch.subject,
          html: patch.html ?? content.html,
          text: patch.text ?? content.text,
        }
      : {
          locale: content.locale,
          subject: content.subject,
          html: content.html,
          text: content.text,
        },
  );
  if (!contents.some((content) => content.locale === locale)) {
    next.push({
      locale,
      subject: patch.subject,
      html: patch.html ?? null,
      text: patch.text ?? null,
    });
  }
  return next;
}

export function registerTemplateTools(ctx: ToolContext): void {
  const { server, coss } = ctx;
  const template = z.string().describe("The template id (etpl_…) or its alias.");

  server.registerTool(
    "pull_email_template",
    {
      title: "Read an email template draft",
      description:
        "The draft of an email template: revision, locales, subject, html and text. Published " +
        "sends keep using the published version until publish_email_template.",
      inputSchema: z.object({ template }),
      annotations: READ_ONLY,
    },
    ({ template: id }) =>
      run(async () => {
        const [found, draft] = await Promise.all([
          coss.email.templates.get(id),
          coss.email.templates.getDraft(id),
        ]);
        if (draft.error) return fail(draft.error);
        return ok({
          ...(found.error
            ? {}
            : {
                alias: found.data.alias,
                name: found.data.name,
                published_version: found.data.published_version,
              }),
          draft: draftSummary(draft.data),
        });
      }),
  );

  server.registerTool(
    "push_email_template",
    {
      title: "Update an email template draft",
      description:
        "Replaces one locale of a template draft (subject, and html and/or text) and returns the " +
        "new revision. Reads the draft first and sends that revision unless you pass one, so a " +
        "concurrent edit is refused instead of overwritten. An unknown alias is created. This " +
        "does not publish: call publish_email_template with the revision it returns.",
      inputSchema: z.object({
        template,
        subject: z.string(),
        html: z.string().optional(),
        text: z.string().optional(),
        locale: z.string().optional().describe("BCP 47 tag. Default en."),
        revision: z
          .number()
          .int()
          .optional()
          .describe("The draft revision you read. Default: the current one."),
      }),
      annotations: WRITE,
    },
    ({ template: id, subject, html, text, locale = "en", revision }) =>
      run(async () => {
        if (html === undefined && text === undefined) {
          const draft = unwrap(await coss.email.templates.getDraft(id));
          const existing = draft.contents.find((content) => content.locale === locale);
          if (!existing) {
            return fail({
              type: "invalid_request_error",
              code: "validation_error",
              message: "Pass html or text for a locale the draft does not have yet.",
              status: null,
              request_id: null,
            });
          }
        }
        const draft = await coss.email.templates.getDraft(id);
        if (draft.error) {
          if (draft.error.type !== "not_found_error" || id.startsWith("etpl_"))
            return fail(draft.error);
          const created = unwrap(
            await coss.email.templates.create({
              name: id,
              alias: id,
              contents: [
                {
                  locale,
                  subject,
                  ...(html !== undefined ? { html } : {}),
                  ...(text !== undefined ? { text } : {}),
                },
              ],
            }),
          );
          const createdDraft = unwrap(await coss.email.templates.getDraft(created.id));
          return ok({ created: true, alias: created.alias, draft: draftSummary(createdDraft) });
        }
        const updated = unwrap(
          await coss.email.templates.updateDraft(id, {
            revision: revision ?? draft.data.revision,
            default_locale: draft.data.default_locale,
            variables: draft.data.variables,
            sample_variables: draft.data.sample_variables,
            contents: withLocale(draft.data.contents, locale, { subject, html, text }),
          }),
        );
        return ok({ created: false, draft: draftSummary(updated) });
      }),
  );

  server.registerTool(
    "list_email_templates",
    {
      title: "List email templates",
      description:
        "The environment's email templates: their ids and aliases (what pull_email_template and " +
        "a send's `template` take), the version sends use, and whether the draft has unpublished " +
        "changes.",
      inputSchema: z.object({ limit: limitSchema(50), cursor: cursorSchema }),
      annotations: READ_ONLY,
    },
    ({ limit, cursor }) =>
      respond(coss.email.templates.list(given({ limit, after: cursor })), (page) => ({
        templates: page.data.map((template) =>
          compact({
            id: template.id,
            alias: template.alias,
            name: template.name,
            description: template.description,
            published_version: template.published_version,
            published_at: template.published_at,
            has_unpublished_changes: template.has_unpublished_changes,
          }),
        ),
        next_cursor: nextCursor(page),
      })),
  );

  server.registerTool(
    "publish_email_template",
    {
      title: "Publish an email template",
      description:
        "Publishes the draft as the next version, which sends use from then on. Reads the draft " +
        "and publishes that revision unless you pass one, so a concurrent save is refused " +
        "instead of publishing a newer edit. Publishing the same revision again returns the " +
        "version already published.",
      inputSchema: z.object({
        template,
        revision: z
          .number()
          .int()
          .optional()
          .describe("The draft revision you reviewed. Default: the current one, read first."),
      }),
      annotations: WRITE,
    },
    ({ template: id, revision }) =>
      run(async () => {
        const reviewed = revision ?? unwrap(await coss.email.templates.getDraft(id)).revision;
        const published = unwrap(await coss.email.templates.publish(id, { revision: reviewed }));
        return ok({
          template_id: published.template_id,
          version: published.version,
          revision: published.revision,
          published_at: published.published_at,
          problems: published.problems,
        });
      }),
  );
}
