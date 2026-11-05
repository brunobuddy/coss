/** `coss forms …`: the environment's forms and their submissions, on the public API. */
import type { Coss, Form, FormSubmission, FormSubmissionStatus, UpdateFormParams } from "coss";
import { type Flags, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { type Context, clientFor, resolveCredentials } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import { jsonObject } from "../fields.ts";
import type { Style } from "../output.ts";
import { table } from "../table.ts";
import { confirmLive, eitherOf, orNull, printDeleted } from "./list-output.ts";

const STATUSES: readonly FormSubmissionStatus[] = [
  "accepted",
  "held",
  "spam",
  "pending_confirmation",
];

const LIMIT = {
  type: "string",
  value: "<n>",
  description: "How many to show, 1-100 (default 20)",
} as const;

async function formsClient(context: Context): Promise<Coss> {
  return clientFor(context.io, await resolveCredentials(context));
}

function limitOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new UsageError("--limit takes a number from 1 to 100.");
  }
  return limit;
}

function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function statusStyle(status: FormSubmissionStatus): Style {
  return status === "accepted" ? "green" : status === "spam" ? "red" : "yellow";
}

const LIST_FLAGS = {
  limit: LIMIT,
  json: { type: "boolean", description: "One form per line, as JSON" },
} as const satisfies Flags;

const list: Command = defineCommand({
  name: "forms list",
  summary: "List forms",
  description: "Lists the environment's forms, newest first, with the endpoint each posts to.",
  flags: LIST_FLAGS,
  run: async ({ values, context }: CommandInput<typeof LIST_FLAGS>) => {
    const coss = await formsClient(context);
    const { data, error } = await coss.forms.list({
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the forms", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("No forms.");
      return 0;
    }
    const lines = table([
      ["ID", "NAME", "ENABLED", "ENDPOINT"],
      ...data.data.map((item) => [
        item.id,
        printable(item.name),
        item.enabled && !item.disabled_by_admin ? "yes" : out.style("yellow", "no"),
        item.endpoint,
      ]),
    ]);
    out.line(out.style("dim", lines[0] ?? ""));
    for (const line of lines.slice(1)) out.line(line);
    return 0;
  },
});

const SUBMISSIONS_FLAGS = {
  status: {
    type: "string",
    value: "<status>",
    choices: STATUSES,
    description: "Only this status: accepted, held, spam or pending_confirmation",
  },
  limit: LIMIT,
  json: { type: "boolean", description: "One submission per line, as JSON" },
} as const satisfies Flags;

const submissions: Command = defineCommand({
  name: "forms submissions",
  summary: "List a form's submissions (--status held: Risk's review queue)",
  usage: "<form> [--status <status>]",
  description:
    "Lists a form's submissions, newest first. Their values are what someone typed into the form.",
  flags: SUBMISSIONS_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof SUBMISSIONS_FLAGS>) => {
    const [formId] = requireArgs(positionals, 1, "forms submissions <form>") as [string];
    const status = values.status;
    if (status !== undefined && !(STATUSES as readonly string[]).includes(status)) {
      throw new UsageError(`--status takes ${STATUSES.join(", ")}; got "${status}".`);
    }
    const coss = await formsClient(context);
    const { data, error } = await coss.forms.submissions.list(formId, {
      ...(status !== undefined && { status: [status as FormSubmissionStatus] }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the submissions", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("No submissions.");
      return 0;
    }
    const lines = table([
      ["ID", "STATUS", "FROM", "FIELDS", "RECEIVED"],
      ...data.data.map((item) => [
        item.id,
        out.style(statusStyle(item.status), item.status),
        // What a submitter typed: never escape sequences.
        printable(item.submitter_email ?? ""),
        printable(Object.keys(item.data).join(", ")),
        when(item.created_at),
      ]),
    ]);
    out.line(out.style("dim", lines[0] ?? ""));
    for (const line of lines.slice(1)) out.line(line);
    if (data.has_more) {
      out.info(
        out.style(
          "dim",
          `There are more: \`coss api forms/${formId}/submissions --paginate\` lists them all.`,
        ),
      );
    }
    return 0;
  },
});

const FORM_FLAGS = {
  json: { type: "boolean", description: "Print the form as JSON" },
} as const satisfies Flags;

const get: Command = defineCommand({
  name: "forms get",
  summary: "Show a form's endpoint and settings",
  usage: "<form>",
  description: "Shows a form: the endpoint a site posts to, its hosted page and origins.",
  flags: FORM_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof FORM_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "forms get <form>") as [string];
    const coss = await formsClient(context);
    const { data, error } = await coss.forms.get(id);
    if (error) throw apiError("Couldn't read the form", error);
    printForm(context, data);
    return 0;
  },
});

function printForm(context: Context, form: Form): void {
  const { out } = context;
  if (out.json) {
    out.data(form);
    return;
  }
  out.line(
    `${form.id} ${printable(form.name)}${form.enabled ? "" : out.style("yellow", " (disabled)")}`,
  );
  out.line(`  Endpoint  ${form.endpoint}`);
  if (form.hosted_url) out.line(`  Hosted    ${form.hosted_url}`);
  if (form.allowed_origins.length > 0) out.line(`  Origins   ${form.allowed_origins.join(", ")}`);
  if (form.fields) {
    out.line(`  Fields    ${printable(form.fields.map((field) => field.name).join(", "))}`);
  }
}

const CREATE_FLAGS = {
  origin: {
    type: "string",
    multiple: true,
    value: "<origin>",
    description: "A site allowed to post: https://acme.com (repeatable)",
  },
  redirect: { type: "string", value: "<url>", description: "Where the browser goes afterwards" },
  json: { type: "boolean", description: "Print the form as JSON" },
} as const satisfies Flags;

const create: Command = defineCommand({
  name: "forms create",
  summary: "Create a form and print the endpoint to post to",
  usage: "<name> [options]",
  description: "Creates a form that accepts any field; `coss api` takes every other setting.",
  flags: CREATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof CREATE_FLAGS>) => {
    const [name] = requireArgs(positionals, 1, "forms create <name>") as [string];
    const coss = await formsClient(context);
    const { data, error } = await coss.forms.create({
      name,
      ...(values.origin && { allowed_origins: values.origin }),
      ...(values.redirect !== undefined && { redirect_url: values.redirect }),
    });
    if (error) throw apiError("Couldn't create the form", error);
    printForm(context, data);
    return 0;
  },
});

const SUBMISSION_FLAGS = {
  json: { type: "boolean", description: "Print the submission as JSON" },
} as const satisfies Flags;

function printSubmission(context: Context, submission: FormSubmission): void {
  const { out } = context;
  if (out.json) {
    out.data(submission);
    return;
  }
  out.line(
    `${submission.id} ${out.style(statusStyle(submission.status), submission.status)} ${when(submission.created_at)}`,
  );
  if (submission.spam_reason) out.line(`  Spam: ${submission.spam_reason}`);
  for (const [name, value] of Object.entries(submission.data)) {
    // What a submitter typed: never escape sequences.
    out.line(`  ${printable(name)}: ${printable(Array.isArray(value) ? value.join(", ") : value)}`);
  }
  for (const file of submission.files) {
    out.line(`  File: ${printable(file.filename)}`);
  }
}

const submission: Command = defineCommand({
  name: "forms submission",
  summary: "Show a submission's values",
  usage: "<form> <submission>",
  description: "Shows a submission's values. They are what someone typed into the form.",
  flags: SUBMISSION_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof SUBMISSION_FLAGS>) => {
    const [form, id] = requireArgs(positionals, 2, "forms submission <form> <submission>") as [
      string,
      string,
    ];
    const coss = await formsClient(context);
    const { data, error } = await coss.forms.submissions.get(form, id);
    if (error) throw apiError("Couldn't read the submission", error);
    printSubmission(context, data);
    return 0;
  },
});

const release: Command = defineCommand({
  name: "forms release",
  summary: "Accept a submission Risk held for review",
  usage: "<form> <submission>",
  description:
    "Accepts a held submission: it then goes to the form's webhooks, notification emails and contacts.",
  flags: SUBMISSION_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof SUBMISSION_FLAGS>) => {
    const [form, id] = requireArgs(positionals, 2, "forms release <form> <submission>") as [
      string,
      string,
    ];
    const coss = await formsClient(context);
    const { data, error } = await coss.forms.submissions.release(form, id);
    if (error) throw apiError("Couldn't release the submission", error);
    printSubmission(context, data);
    return 0;
  },
});

const UPDATE_FLAGS = {
  name: { type: "string", value: "<name>", description: "Its new name" },
  enabled: { type: "boolean", description: "Take submissions" },
  disabled: { type: "boolean", description: "Refuse submissions" },
  origin: {
    type: "string",
    multiple: true,
    value: "<origin>",
    description: "Sites allowed to post, replacing the list: https://acme.com (repeatable)",
  },
  redirect: {
    type: "string",
    value: "<url>",
    description: "Where the browser goes afterwards (none: nowhere)",
  },
  data: {
    type: "string",
    value: "<json>",
    description:
      "Any other settings (fields, spam, submitter, notifications, contacts, files, hosted), as " +
      "JSON: inline, @file or - for stdin; the flags above win over it",
  },
  json: { type: "boolean", description: "Print the form as JSON" },
} as const satisfies Flags;

const update: Command = defineCommand({
  name: "forms update",
  summary: "Change a form's settings",
  usage: "<form> [options]",
  description: "Changes what is given and leaves the rest, within each group of settings too.",
  flags: UPDATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof UPDATE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "forms update <form> [options]") as [string];
    const enabled = eitherOf(values.enabled, values.disabled, ["--enabled", "--disabled"]);
    const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
    const params = {
      ...base,
      ...(values.name !== undefined && { name: values.name }),
      ...(enabled !== undefined && { enabled }),
      ...(values.origin && { allowed_origins: values.origin }),
      ...(values.redirect !== undefined && { redirect_url: orNull(values.redirect, "none") }),
    } as UpdateFormParams;
    if (Object.keys(params).length === 0) {
      throw new UsageError("Pass at least one setting to change (coss forms update --help).");
    }
    const coss = await formsClient(context);
    const { data, error } = await coss.forms.update(id, params);
    if (error) throw apiError("Couldn't change the form", error);
    printForm(context, data);
    return 0;
  },
});

const REMOVE_FLAGS = {
  yes: { type: "boolean", description: "Don't ask before deleting with a live key" },
  json: { type: "boolean", description: "Print the result as JSON" },
} as const satisfies Flags;

const remove: Command = defineCommand({
  name: "forms remove",
  summary: "Delete a form with its submissions and files",
  usage: "<form> [--yes]",
  description:
    "Deletes a form with its submissions and files. It can't be undone, so with a live key it " +
    "asks first; off a terminal it needs --yes.",
  flags: REMOVE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof REMOVE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "forms remove <form>") as [string];
    const credentials = await resolveCredentials(context);
    const go = await confirmLive(
      context,
      credentials.apiKey,
      values.yes,
      `Delete ${id} with its submissions and files? It can't be undone.`,
      "Nothing was deleted.",
    );
    if (!go) return 1;
    const coss = clientFor(context.io, credentials);
    const { data, error } = await coss.forms.remove(id);
    if (error) throw apiError("Couldn't delete the form", error);
    printDeleted(context.out, data);
    return 0;
  },
});

export const FORMS_COMMANDS: readonly Command[] = [
  list,
  get,
  create,
  update,
  remove,
  submissions,
  submission,
  release,
];
