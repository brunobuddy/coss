import { readFile } from "node:fs/promises";
import type { Coss, Email, EmailEvent, EmailRecipientStatus, SendEmailParams } from "coss";
import { addresses, type Flags, jsonOrString, pairs, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { type Context, clientFor, resolveCredentials } from "../context.ts";
import {
  isSimulatedOutcome,
  SIMULATED_OUTCOMES,
  type SimulatedOutcome,
} from "../emails/simulate.ts";
import { apiError, CliError, UsageError } from "../errors.ts";
import type { Output } from "../output.ts";
import { client, confirmLive, printOne, when } from "./list-output.ts";

const SANDBOX_FROM = "coss.com CLI <cli@example.com>";
const DEFAULT_SUBJECT = "Test email from the coss.com CLI";
const DEFAULT_TEXT = "Sent with `coss emails send`. https://coss.com/docs/cli";

/** Recipient statuses after which nothing more is expected (unless waiting for a complaint). */
const SETTLED: ReadonlySet<EmailRecipientStatus> = new Set([
  "delivered",
  "bounced",
  "suppressed",
  "complained",
  "failed",
  "canceled",
]);

async function fileOrValue(value: string | undefined, file: string | undefined, flag: string) {
  if (value !== undefined && file !== undefined) {
    throw new UsageError(`Pass --${flag} or --${flag}-file, not both.`);
  }
  if (file === undefined) return value;
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    throw new CliError(`Couldn't read ${file}: ${(error as Error).message}`);
  }
}

function settled(email: Email, simulate: SimulatedOutcome | undefined): boolean {
  if (email.status === "failed" || email.status === "canceled") return true;
  if (email.status === "queued" || email.status === "scheduled") return false;
  return email.recipients.every((recipient) =>
    simulate === "complained" && recipient.address === SIMULATED_OUTCOMES.complained
      ? recipient.status === "complained"
      : SETTLED.has(recipient.status),
  );
}

async function waitForOutcome(
  context: Context,
  coss: Coss,
  email: Email,
  options: { timeoutMs: number; simulate: SimulatedOutcome | undefined },
): Promise<{ email: Email; events: EmailEvent[]; settled: boolean }> {
  const { io, out } = context;
  const deadline = io.now().getTime() + options.timeoutMs;
  let current = email;
  if (!out.json) out.info("Waiting for the outcome…");
  while (
    !settled(current, options.simulate) &&
    io.now().getTime() < deadline &&
    !io.signal.aborted
  ) {
    await io.sleep(1000, io.signal);
    const { data, error } = await coss.email.get(current.id, { signal: io.signal });
    if (error) {
      if (io.signal.aborted) break;
      throw apiError("Couldn't read the email", error);
    }
    current = data;
  }
  const { data, error } = await coss.email.listEvents(current.id);
  if (error) throw apiError("Couldn't read the email's events", error);
  return { email: current, events: data.data, settled: settled(current, options.simulate) };
}

function statusStyle(status: string): Parameters<Output["style"]>[0] {
  if (status === "delivered" || status === "sent") return "green";
  if (status === "queued" || status === "scheduled" || status === "delivery_delayed")
    return "yellow";
  return "red";
}

const FLAGS = {
  to: {
    type: "string",
    multiple: true,
    value: "<address>",
    description: "Recipient (repeatable, or comma-separated)",
  },
  simulate: {
    type: "string",
    value: "<outcome>",
    choices: Object.keys(SIMULATED_OUTCOMES),
    description: "Send to the mailbox simulator: delivered, bounced, complained, suppressed",
  },
  from: {
    type: "string",
    value: "<address>",
    description:
      "Sender (default for sandbox keys: coss.com CLI <cli@example.com>; live keys need an " +
      "address on a verified domain)",
  },
  cc: { type: "string", multiple: true, value: "<address>", description: "Cc (repeatable)" },
  bcc: { type: "string", multiple: true, value: "<address>", description: "Bcc (repeatable)" },
  "reply-to": {
    type: "string",
    multiple: true,
    value: "<address>",
    description: "Reply-To (repeatable)",
  },
  subject: {
    type: "string",
    value: "<text>",
    description: 'Default: "Test email from the coss.com CLI"',
  },
  text: { type: "string", value: "<text>", description: "The plain-text body" },
  "text-file": { type: "string", value: "<path>", description: "The plain-text body, from a file" },
  html: { type: "string", value: "<html>", description: "The HTML body" },
  "html-file": { type: "string", value: "<path>", description: "The HTML body, from a file" },
  template: {
    type: "string",
    value: "<id|alias>",
    description: "Send a published template (instead of subject and body)",
  },
  var: {
    type: "string",
    multiple: true,
    value: "<name=value>",
    description: "A template variable (repeatable; values are JSON when they parse)",
  },
  category: { type: "string", value: "<name>", description: "The email's category" },
  tag: { type: "string", multiple: true, value: "<name=value>", description: "A tag (repeatable)" },
  wait: {
    type: "boolean",
    description: "Follow the email until every recipient's outcome is known, then show its events",
  },
  timeout: {
    type: "string",
    value: "<seconds>",
    description: "How long --wait waits (default 60)",
  },
  json: {
    type: "boolean",
    description: "Print the email (and with --wait, its events) as JSON",
  },
} as const satisfies Flags;

export const emailsSendCommand: Command = defineCommand({
  name: "emails send",
  summary: "Send a test email (--simulate bounced, --wait…)",
  description:
    "Sends a test email from the API key's environment. Sandbox keys (coss_test_…) never deliver: " +
    "they go through coss.com's simulated provider, with every event and webhook a real send has.",
  flags: FLAGS,
  run: emailsSend,
});

async function emailsSend({ values, context }: CommandInput<typeof FLAGS>): Promise<number> {
  const { io, out } = context;
  const simulate = values.simulate;
  if (simulate !== undefined && !isSimulatedOutcome(simulate)) {
    throw new UsageError(
      `--simulate takes ${Object.keys(SIMULATED_OUTCOMES).join(", ")}; got "${simulate}".`,
    );
  }
  const to = [...addresses(values.to), ...(simulate ? [SIMULATED_OUTCOMES[simulate]] : [])];
  if (to.length === 0) throw new UsageError("Pass --to <address> or --simulate <outcome>.");
  const timeoutS = values.timeout === undefined ? 60 : Number(values.timeout);
  if (!Number.isFinite(timeoutS) || timeoutS <= 0) {
    throw new UsageError("--timeout takes a number of seconds.");
  }

  const credentials = await resolveCredentials(context);
  const live = credentials.apiKey.startsWith("coss_live_");
  if (live && !values.from) {
    throw new UsageError("Live keys send from your own domain: pass --from you@your-domain.");
  }
  const base = {
    from: values.from ?? SANDBOX_FROM,
    to,
    ...(values.cc && { cc: addresses(values.cc) }),
    ...(values.bcc && { bcc: addresses(values.bcc) }),
    ...(values["reply-to"] && { reply_to: addresses(values["reply-to"]) }),
    ...(values.category && { category: values.category }),
    ...(values.tag && {
      tags: pairs(values.tag, "tag").map(([name, value]) => ({ name, value })),
    }),
  };
  const text = await fileOrValue(values.text, values["text-file"], "text");
  const html = await fileOrValue(values.html, values["html-file"], "html");
  let params: SendEmailParams;
  if (values.template) {
    if (values.subject || text !== undefined || html !== undefined) {
      throw new UsageError(
        "A template brings its own subject and body: drop --subject/--text/--html.",
      );
    }
    params = {
      ...base,
      template_id: values.template,
      ...(values.var && {
        variables: Object.fromEntries(
          pairs(values.var, "var").map(([name, raw]) => [name, jsonOrString(raw)]),
        ),
      }),
    };
  } else {
    if (values.var) throw new UsageError("--var only applies with --template.");
    params = {
      ...base,
      subject: values.subject ?? DEFAULT_SUBJECT,
      ...(html !== undefined && { html }),
      ...(text !== undefined || html === undefined ? { text: text ?? DEFAULT_TEXT } : {}),
    };
  }

  const coss = clientFor(io, credentials);
  const { data: email, error } = await coss.email.send(params, { signal: io.signal });
  if (error) throw apiError("Couldn't send the email", error);

  if (!values.wait) {
    if (out.json) out.data(email);
    else {
      out.line(
        `${out.style("green", "✔")} ${email.id} ${email.status} → ${to.join(", ")}${email.sandbox ? out.style("dim", " (sandbox)") : ""}`,
      );
      out.info(
        out.style("dim", "Add --wait to follow it, or run `coss logs tail` to watch every event."),
      );
    }
    return 0;
  }

  const outcome = await waitForOutcome(context, coss, email, {
    timeoutMs: timeoutS * 1000,
    simulate,
  });
  if (out.json) {
    out.data({ ...outcome.email, events: outcome.events });
  } else {
    out.line(
      `${outcome.email.id} ${out.style(statusStyle(outcome.email.status), outcome.email.status)}`,
    );
    for (const recipient of outcome.email.recipients) {
      out.line(
        `  ${recipient.address}  ${out.style(statusStyle(recipient.status), recipient.status)}`,
      );
    }
    if (outcome.events.length > 0) out.line();
    for (const event of outcome.events) {
      out.line(
        `  ${out.style("dim", event.occurred_at)}  ${event.type}${event.recipient ? `  ${event.recipient}` : ""}`,
      );
    }
  }
  if (!outcome.settled && !io.signal.aborted) {
    out.warn(
      "Not every outcome arrived in time. Sends need the worker running (locally: `bun run dev`).",
    );
    return 1;
  }
  return io.signal.aborted ? 130 : 0;
}

function printScheduled(out: Output, email: Email): void {
  const at =
    email.status === "scheduled" && email.scheduled_at ? ` ${when(email.scheduled_at)}` : "";
  out.line(`${email.id} ${out.style(statusStyle(email.status), email.status)}${at}`);
}

const CANCEL_FLAGS = {
  json: { type: "boolean", description: "Print the email as JSON" },
} as const satisfies Flags;

export const emailsCancelCommand: Command = defineCommand({
  name: "emails cancel",
  summary: "Cancel a scheduled email",
  usage: "<email>",
  description:
    "Cancels an email scheduled for later. Canceling it again answers the same; any email that " +
    "isn't scheduled any more fails.",
  flags: CANCEL_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof CANCEL_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "emails cancel <email>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.cancel(id);
    if (error) throw apiError("Couldn't cancel the email", error);
    printOne(context.out, data, printScheduled);
    return 0;
  },
});

const RESCHEDULE_FLAGS = {
  at: {
    type: "string",
    value: "<time>",
    description: "The new time: ISO 8601 with an offset, at most 30 days ahead",
  },
  yes: { type: "boolean", description: "Don't ask before a live send right away" },
  json: { type: "boolean", description: "Print the email as JSON" },
} as const satisfies Flags;

export const emailsRescheduleCommand: Command = defineCommand({
  name: "emails reschedule",
  summary: "Move a scheduled email to another time",
  usage: "<email> --at <time>",
  description:
    "Moves a scheduled email. A time that isn't in the future sends it right away: with a live " +
    "key that asks first, and off a terminal it needs --yes.",
  flags: RESCHEDULE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof RESCHEDULE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "emails reschedule <email> --at <time>") as [string];
    if (!values.at) throw new UsageError("Pass --at <time>, e.g. --at 2027-01-04T09:00:00Z.");
    const at = Date.parse(values.at);
    if (Number.isNaN(at)) {
      throw new UsageError("--at takes an ISO 8601 time with an offset: 2027-01-04T09:00:00Z.");
    }
    const credentials = await resolveCredentials(context);
    if (at <= context.io.now().getTime()) {
      const go = await confirmLive(
        context,
        credentials.apiKey,
        values.yes,
        `That time has passed, so ${id} would go out right away. Send it?`,
      );
      if (!go) return 1;
    }
    const coss = clientFor(context.io, credentials);
    const { data, error } = await coss.email.reschedule(id, { scheduled_at: values.at });
    if (error) throw apiError("Couldn't reschedule the email", error);
    printOne(context.out, data, printScheduled);
    return 0;
  },
});
