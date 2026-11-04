/** Reading emails back: `coss emails list`, `get`, `events` and `diagnose`. */
import type {
  Coss,
  Email,
  EmailRecipientStatus,
  EmailStatus,
  EmailSummary,
  ListEmailsParams,
} from "coss";
import { type Diagnosis, type DiagnosisReferences, diagnose } from "coss/diagnose";
import { type Flags, list } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { type Context, clientFor, resolveCredentials } from "../context.ts";
import {
  deliveryStatus,
  formatEvent,
  minute,
  printable,
  shorten,
  statusStyle,
  table,
} from "../emails/format.ts";
import { apiError, CliError, UsageError } from "../errors.ts";
import { parseSince } from "../logs/tail.ts";
import type { Output } from "../output.ts";

const EMAIL_STATUSES: readonly EmailStatus[] = [
  "queued",
  "sent",
  "failed",
  "scheduled",
  "canceled",
];
const RECIPIENT_STATUSES: readonly EmailRecipientStatus[] = [
  "queued",
  "sent",
  "delivery_delayed",
  "delivered",
  "bounced",
  "suppressed",
  "complained",
  "failed",
  "canceled",
];
const PAGE_SIZE = 100;

function checked<T extends string>(values: string[], allowed: readonly T[], flag: string): T[] {
  for (const value of values) {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new UsageError(`--${flag} takes ${allowed.join(", ")}; got "${value}".`);
    }
  }
  return values as T[];
}

function time(value: string | undefined, flag: string, now: Date): Date | undefined {
  if (value === undefined) return undefined;
  const date = parseSince(value, now);
  if (!date) throw new UsageError(`--${flag} takes 30s, 15m, 2h, 1d or an ISO 8601 time.`);
  return date;
}

function oneId(positionals: string[], command: string): string {
  const [id, ...extra] = positionals;
  if (id === undefined || extra.length > 0) {
    throw new UsageError(`Pass one email id: \`coss ${command} email_…\`.`);
  }
  return id;
}

async function client(context: Context): Promise<Coss> {
  return clientFor(context.io, await resolveCredentials(context));
}

const LIST_FLAGS = {
  to: {
    type: "string",
    value: "<address>",
    description: "Only emails with this recipient (to, cc or bcc)",
  },
  status: {
    type: "string",
    multiple: true,
    value: "<status>",
    choices: EMAIL_STATUSES,
    description: "queued, sent, failed, scheduled, canceled (repeatable, or comma-separated)",
  },
  "recipient-status": {
    type: "string",
    multiple: true,
    value: "<status>",
    choices: RECIPIENT_STATUSES,
    description:
      "Only emails with a recipient in these delivery statuses, e.g. bounced,complained (with " +
      "--to: that recipient's)",
  },
  query: {
    type: "string",
    short: "q",
    value: "<text>",
    description: "Text in the subject or a to address",
  },
  category: { type: "string", value: "<name>", description: "Only emails of this category" },
  batch: { type: "string", value: "<id>", description: "Only the emails of this batch" },
  since: {
    type: "string",
    value: "<time>",
    description: "Only emails created since: 30s, 15m, 2h, 1d or an ISO 8601 time",
  },
  until: { type: "string", value: "<time>", description: "Only emails created before this time" },
  limit: { type: "string", value: "<n>", description: "How many, newest first (default 20)" },
  json: { type: "boolean", description: "One email per line, as JSON" },
} as const satisfies Flags;

export const emailsListCommand: Command = defineCommand({
  name: "emails list",
  summary: "List the environment's emails, newest first",
  description:
    "Lists the emails the API key's environment sent, newest first, with where each one stands: " +
    "its status until it was handed to the provider, then its recipients' (delivered, bounced, …).",
  flags: LIST_FLAGS,
  run: emailsList,
});

async function emailsList({ values, context }: CommandInput<typeof LIST_FLAGS>): Promise<number> {
  const { io, out } = context;
  const limit = values.limit === undefined ? 20 : Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new UsageError("--limit takes a whole number, at least 1.");
  }
  const now = io.now();
  const params: ListEmailsParams = {
    ...(values.to && { to: values.to }),
    ...(values.status && { status: checked(list(values.status), EMAIL_STATUSES, "status") }),
    ...(values["recipient-status"] && {
      recipient_status: checked(
        list(values["recipient-status"]),
        RECIPIENT_STATUSES,
        "recipient-status",
      ),
    }),
    ...(values.query && { q: values.query }),
    ...(values.category && { category: values.category }),
    ...(values.batch && { batch_id: values.batch }),
    created_after: time(values.since, "since", now),
    created_before: time(values.until, "until", now),
  };
  const coss = await client(context);
  const emails: EmailSummary[] = [];
  let after: string | undefined;
  while (emails.length < limit) {
    const { data, error } = await coss.email.list(
      { ...params, limit: Math.min(PAGE_SIZE, limit - emails.length), ...(after && { after }) },
      { signal: io.signal },
    );
    if (io.signal.aborted) return 130;
    if (error) throw apiError("Couldn't list the emails", error);
    for (const email of data.data) {
      if (out.json) out.data(email);
      emails.push(email);
    }
    const last = data.data.at(-1);
    if (!data.has_more || !last) break;
    after = last.id;
  }
  if (out.json) return 0;
  if (emails.length === 0) {
    out.info("No emails match.");
    return 0;
  }
  const rows = emails.map((email) => [
    email.id,
    deliveryStatus(email),
    minute(email.created_at),
    shorten(printable(email.recipients.map((r) => r.address).join(", ")), 32),
    shorten(printable(email.subject), 60),
  ]);
  table(out, ["ID", "STATUS", "CREATED", "TO", "SUBJECT"], rows);
  return 0;
}

const GET_FLAGS = {
  text: { type: "boolean", description: "Print only the plain-text body" },
  html: { type: "boolean", description: "Print only the HTML body" },
  json: { type: "boolean", description: "Print the email as JSON" },
} as const satisfies Flags;

export const emailsGetCommand: Command = defineCommand({
  name: "emails get",
  summary: "Show an email: recipients, status, content",
  usage: "<id> [options]",
  description:
    "Shows an email of the environment: its sender, recipients and their delivery statuses, " +
    "subject, failure, tracking and attachments. --text or --html prints that body alone.",
  flags: GET_FLAGS,
  positionals: true,
  run: emailsGet,
});

function field(out: Output, name: string, value: string | null | undefined): void {
  if (value) out.line(`  ${out.style("dim", name.padEnd(11))}${printable(value)}`);
}

async function emailsGet({
  values,
  positionals,
  context,
}: CommandInput<typeof GET_FLAGS>): Promise<number> {
  const { io, out } = context;
  const id = oneId(positionals, "emails get");
  if (values.text && values.html) throw new UsageError("Pass --text or --html, not both.");
  const coss = await client(context);
  const { data: email, error } = await coss.email.get(id, { signal: io.signal });
  if (io.signal.aborted) return 130;
  if (error) throw apiError("Couldn't read the email", error);
  if (out.json) {
    out.data(email);
    return 0;
  }
  if (values.text || values.html) {
    const body = values.text ? email.text : email.html;
    if (body === null)
      throw new CliError(`${email.id} has no ${values.text ? "text" : "HTML"} body.`);
    out.line(printable(body, true));
    return 0;
  }
  printEmail(out, email);
  return 0;
}

function printEmail(out: Output, email: Email): void {
  const status = deliveryStatus(email);
  out.line(
    `${out.style("bold", email.id)}  ${out.style(statusStyle(status), status)}${email.sandbox ? out.style("dim", " (sandbox)") : ""}`,
  );
  field(out, "From", email.from);
  field(out, "Subject", email.subject);
  field(out, "Reply-To", email.reply_to.join(", "));
  field(out, "Category", email.category);
  field(out, "Tags", email.tags.map((tag) => `${tag.name}=${tag.value}`).join(", "));
  field(
    out,
    "Template",
    email.template
      ? `${email.template.id} ${email.template.version === null ? "draft" : `v${email.template.version}`} (${email.template.locale})`
      : null,
  );
  field(out, "Created", email.created_at);
  field(out, "Scheduled", email.scheduled_at);
  field(out, "Sent", email.sent_at);
  if (email.failure) {
    out.line(
      `  ${out.style("dim", "Failure".padEnd(11))}${out.style("red", email.failure.code)}: ${printable(email.failure.message)}`,
    );
  }
  out.line();
  for (const recipient of email.recipients) {
    out.line(
      `  ${recipient.type.padEnd(4)}${printable(recipient.address)}  ${out.style(statusStyle(recipient.status), recipient.status)}`,
    );
  }
  const tracking = email.tracking;
  if (tracking.opens || tracking.clicks) {
    out.line();
    field(
      out,
      "Tracking",
      [
        tracking.opens ? `${tracking.open_count} open(s)` : "",
        tracking.clicks ? `${tracking.click_count} click(s)` : "",
      ]
        .filter(Boolean)
        .join(", "),
    );
  }
  if (email.attachments.length > 0) {
    out.line();
    for (const attachment of email.attachments) {
      field(out, "Attachment", `${attachment.filename} (${attachment.content_type})`);
    }
  }
  out.info(
    out.style(
      "dim",
      `\n--text or --html prints a body; \`coss emails events ${email.id}\` its events.`,
    ),
  );
}

const EVENTS_FLAGS = {
  json: { type: "boolean", description: "One event per line, as JSON" },
} as const satisfies Flags;

export const emailsEventsCommand: Command = defineCommand({
  name: "emails events",
  summary: "Show an email's delivery events",
  usage: "<id> [options]",
  description:
    "Shows an email's events, oldest first: sent, delivered, bounced (with the receiving " +
    "server's answer), complained, suppressed, opened, clicked, …",
  flags: EVENTS_FLAGS,
  positionals: true,
  run: async ({ positionals, context }) => {
    const { io, out } = context;
    const id = oneId(positionals, "emails events");
    const coss = await client(context);
    const { data, error } = await coss.email.listEvents(id, { signal: io.signal });
    if (io.signal.aborted) return 130;
    if (error) throw apiError("Couldn't read the email's events", error);
    if (data.data.length === 0 && !out.json) out.info("No events yet.");
    for (const event of data.data) {
      if (out.json) out.data(event);
      else out.line(formatEvent(out, event));
    }
    return 0;
  },
});

/** Next steps name the commands that look further. */
export const CLI_REFERENCES: DiagnosisReferences = {
  check_suppression: "`coss api suppressions -f address=<address>`",
  remove_suppression: "`coss api -X DELETE suppressions/<id>`",
  list_domains: "`coss api domains`",
  get_domain: "`coss api domains/<id>`",
  verify_domain: "`coss api -X POST domains/<id>/verify`",
  get_account_status: "`coss api reputation`",
};

const VERDICT_STYLE: Record<Diagnosis["verdict"], "green" | "yellow" | "red" | "dim"> = {
  delivered: "green",
  partially_delivered: "yellow",
  in_progress: "yellow",
  scheduled: "yellow",
  canceled: "dim",
  not_delivered: "red",
};

const DIAGNOSE_FLAGS = {
  to: {
    type: "string",
    value: "<address>",
    description: "Diagnose the newest email to this address instead of an id",
  },
  json: { type: "boolean", description: "Print the diagnosis as JSON" },
} as const satisfies Flags;

export const emailsDiagnoseCommand: Command = defineCommand({
  name: "emails diagnose",
  summary: "Explain whether an email was delivered, and why not",
  usage: "<id> | --to <address> [options]",
  description:
    "Explains what happened to an email: a verdict, what each recipient's status means (a " +
    "bounce with the receiving server's reason, a suppression with its entry, a delay, a " +
    "failure with its cause), account problems that affect it (an unverified domain, " +
    "reputation, billing holds) and what to do next.",
  flags: DIAGNOSE_FLAGS,
  positionals: true,
  run: emailsDiagnose,
});

function details(out: Output, values: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    out.line(`    ${out.style("dim", `${name}:`)} ${printable(text)}`);
  }
}

function steps(out: Output, next: string[], indent: string): void {
  for (const step of next) out.line(`${indent}${out.style("cyan", "→")} ${step}`);
}

async function emailsDiagnose({
  values,
  positionals,
  context,
}: CommandInput<typeof DIAGNOSE_FLAGS>): Promise<number> {
  const { io, out } = context;
  if (values.to !== undefined && positionals.length > 0) {
    throw new UsageError("Pass an email id or --to, not both.");
  }
  const coss = await client(context);
  let id: string;
  if (values.to !== undefined) {
    const { data, error } = await coss.email.list(
      { to: values.to, limit: 1 },
      { signal: io.signal },
    );
    if (io.signal.aborted) return 130;
    if (error) throw apiError("Couldn't find the email", error);
    const newest = data.data[0];
    if (!newest) {
      throw new CliError(
        `No email to ${values.to} in this environment (sandbox and live emails are separate; ` +
          "emails are kept 45 days). A send the API refused never creates an email: " +
          "`coss logs tail --type api.request --status 4xx --since 1d` shows refused requests.",
      );
    }
    id = newest.id;
  } else {
    id = oneId(positionals, "emails diagnose");
  }
  const { data: diagnosis, error } = await diagnose(coss, id, {
    signal: io.signal,
    now: io.now(),
    references: CLI_REFERENCES,
  });
  if (io.signal.aborted) return 130;
  if (error) throw apiError("Couldn't diagnose the email", error);
  if (out.json) {
    out.data(diagnosis);
    return 0;
  }
  out.line(
    `${out.style(["bold", VERDICT_STYLE[diagnosis.verdict]], diagnosis.verdict.replace("_", " "))}  ${printable(diagnosis.summary)}`,
  );
  out.line(
    out.style(
      "dim",
      `${diagnosis.email_id} · ${printable(diagnosis.subject)} · ${diagnosis.created_at}`,
    ),
  );
  if (diagnosis.failure) {
    out.line();
    out.line(
      `  ${out.style("red", diagnosis.failure.code)}: ${printable(diagnosis.failure.message)}`,
    );
    out.line(`    ${diagnosis.failure.explanation}`);
    steps(out, diagnosis.failure.next_steps, "    ");
  }
  for (const recipient of diagnosis.recipients) {
    out.line();
    out.line(
      `  ${printable(recipient.address)}  ${out.style(statusStyle(recipient.outcome), recipient.outcome)}`,
    );
    out.line(`    ${recipient.explanation}`);
    if (recipient.details) details(out, recipient.details);
    steps(out, recipient.next_steps, "    ");
  }
  if (diagnosis.warnings.length > 0) {
    out.line();
    for (const warning of diagnosis.warnings) out.line(`  ${out.style("yellow", "!")} ${warning}`);
  }
  if (diagnosis.timeline.length > 0) {
    out.line();
    for (const entry of diagnosis.timeline) {
      out.line(
        `  ${out.style("dim", entry.at)}  ${entry.type}${entry.recipient ? `  ${printable(entry.recipient)}` : ""}`,
      );
    }
  }
  return 0;
}
