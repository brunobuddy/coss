import type { Coss, ReceivedSms, SendSmsParams, Sms, SmsEvent, SmsStatus } from "coss";
import { type Flags, pairs, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { type Context, clientFor, resolveCredentials } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import type { Output } from "../output.ts";
import {
  isSimulatedSmsOutcome,
  SIMULATED_SMS_OUTCOMES,
  type SimulatedSmsOutcome,
} from "../sms/simulate.ts";
import { client, LIMIT, limitOf, oneOf, printList, when } from "./list-output.ts";

const SANDBOX_FROM = "+14155550100";
const DEFAULT_BODY = "Test message from the coss.com CLI";

/** Statuses after which nothing more is expected. */
const SETTLED: ReadonlySet<SmsStatus> = new Set(["delivered", "undelivered", "failed", "canceled"]);

function settled(sms: Sms): boolean {
  return SETTLED.has(sms.status);
}

async function waitForOutcome(
  context: Context,
  coss: Coss,
  sms: Sms,
  options: { timeoutMs: number; reply: boolean },
): Promise<{ sms: Sms; events: SmsEvent[]; replies: ReceivedSms[] | undefined; settled: boolean }> {
  const { io, out } = context;
  const deadline = io.now().getTime() + options.timeoutMs;
  let current = sms;
  if (!out.json) out.info("Waiting for the outcome…");
  while (!settled(current) && io.now().getTime() < deadline && !io.signal.aborted) {
    await io.sleep(1000, io.signal);
    const { data, error } = await coss.sms.get(current.id, { signal: io.signal });
    if (error) {
      if (io.signal.aborted) break;
      throw apiError("Couldn't read the message", error);
    }
    current = data;
  }
  // Ctrl-C: show what is known, without more requests.
  if (io.signal.aborted) {
    return { sms: current, events: [], replies: undefined, settled: settled(current) };
  }
  const { data, error } = await coss.sms.listEvents(current.id, { signal: io.signal });
  if (error) {
    if (io.signal.aborted) {
      return { sms: current, events: [], replies: undefined, settled: settled(current) };
    }
    throw apiError("Couldn't read the message's events", error);
  }
  let replies: ReceivedSms[] | undefined;
  if (options.reply && current.status === "delivered" && !io.signal.aborted) {
    // The simulator replies as the message is handed over: it is there once the message is.
    const received = await coss.sms.received.list(
      { from: current.to, to: current.from, created_after: current.created_at },
      { signal: io.signal },
    );
    if (received.error && !io.signal.aborted) {
      throw apiError("Couldn't read the received messages", received.error);
    }
    replies = received.data?.data;
  }
  return { sms: current, events: data.data, replies, settled: settled(current) };
}

function statusStyle(status: string): Parameters<Output["style"]>[0] {
  if (status === "delivered" || status === "sent") return "green";
  if (status === "queued" || status === "scheduled") return "yellow";
  return "red";
}

const FLAGS = {
  to: { type: "string", value: "<number>", description: "Recipient, in E.164 form (+14155550123)" },
  simulate: {
    type: "string",
    value: "<outcome>",
    choices: Object.keys(SIMULATED_SMS_OUTCOMES),
    description:
      "Send to the SMS simulator (sandbox keys only): delivered, invalid, filtered, opted-out, reply",
  },
  from: {
    type: "string",
    value: "<number>",
    description:
      "Sender, in E.164 form (default for sandbox keys: +14155550100; live keys need one of your " +
      "organization's registered numbers)",
  },
  body: {
    type: "string",
    value: "<text>",
    description: 'Default: "Test message from the coss.com CLI"',
  },
  tag: { type: "string", multiple: true, value: "<name=value>", description: "A tag (repeatable)" },
  wait: {
    type: "boolean",
    description:
      "Follow the message until its outcome is known, then show its events (with --simulate " +
      "reply, also the reply)",
  },
  timeout: {
    type: "string",
    value: "<seconds>",
    description: "How long --wait waits (default 60)",
  },
  json: {
    type: "boolean",
    description: "Print the message (and with --wait, its events) as JSON",
  },
} as const satisfies Flags;

export const smsSendCommand: Command = defineCommand({
  name: "sms send",
  summary: "Send a test text message (--simulate filtered, --wait…)",
  description:
    "Sends a test text message from the API key's environment. Sandbox keys (coss_test_…) never " +
    "reach a phone: they go through coss.com's simulated provider, with every event and webhook a " +
    "real send has.",
  flags: FLAGS,
  run: smsSend,
});

async function smsSend({ values, context }: CommandInput<typeof FLAGS>): Promise<number> {
  const { io, out } = context;
  const simulate = values.simulate;
  if (simulate !== undefined && !isSimulatedSmsOutcome(simulate)) {
    throw new UsageError(
      `--simulate takes ${Object.keys(SIMULATED_SMS_OUTCOMES).join(", ")}; got "${simulate}".`,
    );
  }
  if (simulate && values.to) throw new UsageError("Pass --to or --simulate, not both.");
  const to = simulate ? SIMULATED_SMS_OUTCOMES[simulate as SimulatedSmsOutcome] : values.to;
  if (!to) throw new UsageError("Pass --to <number> or --simulate <outcome>.");
  const timeoutS = values.timeout === undefined ? 60 : Number(values.timeout);
  if (!Number.isFinite(timeoutS) || timeoutS <= 0) {
    throw new UsageError("--timeout takes a number of seconds.");
  }
  const tags = pairs(values.tag ?? [], "tag").map(([name, value]) => ({ name, value }));

  const credentials = await resolveCredentials(context);
  const live = credentials.apiKey.startsWith("coss_live_");
  if (live && simulate) {
    throw new UsageError(
      "--simulate needs a sandbox (coss_test_) key: live messages go to real carriers. Pass --to.",
    );
  }
  if (live && !values.from) {
    throw new UsageError(
      "Live keys send from one of your organization's numbers: pass --from +1….",
    );
  }
  const params: SendSmsParams = {
    from: values.from ?? SANDBOX_FROM,
    to,
    body: values.body ?? DEFAULT_BODY,
    ...(tags.length > 0 && { tags }),
  };

  const coss = clientFor(io, credentials);
  const { data: sms, error } = await coss.sms.send(params, { signal: io.signal });
  if (error) throw apiError("Couldn't send the message", error);

  if (!values.wait) {
    if (out.json) out.data(sms);
    else {
      out.line(
        `${out.style("green", "✔")} ${sms.id} ${sms.status} → ${sms.to}${sms.sandbox ? out.style("dim", " (sandbox)") : ""}`,
      );
      out.info(
        out.style("dim", "Add --wait to follow it, or run `coss logs tail` to watch every event."),
      );
    }
    return 0;
  }

  const outcome = await waitForOutcome(context, coss, sms, {
    timeoutMs: timeoutS * 1000,
    reply: simulate === "reply",
  });
  if (out.json) {
    out.data({
      ...outcome.sms,
      events: outcome.events,
      ...(outcome.replies && { replies: outcome.replies }),
    });
  } else {
    out.line(
      `${outcome.sms.id} ${out.style(statusStyle(outcome.sms.status), outcome.sms.status)} → ${outcome.sms.to}`,
    );
    if (outcome.sms.failure) {
      out.line(`  ${outcome.sms.failure.code}: ${outcome.sms.failure.message}`);
    }
    if (outcome.events.length > 0) out.line();
    for (const event of outcome.events) {
      const failure = event.data.failure ? `  ${event.data.failure.code}` : "";
      out.line(`  ${out.style("dim", event.occurred_at)}  ${event.type}${failure}`);
    }
    for (const reply of outcome.replies ?? []) {
      out.line();
      out.line(`  ${out.style("dim", reply.created_at)}  reply from ${reply.from}: ${reply.body}`);
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

const STATUSES: readonly SmsStatus[] = [
  "scheduled",
  "queued",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "canceled",
];

const LIST_FLAGS = {
  to: { type: "string", value: "<number>", description: "Only messages to this number" },
  status: {
    type: "string",
    value: "<status>",
    choices: STATUSES,
    description: STATUSES.join(", "),
  },
  limit: LIMIT,
  json: { type: "boolean", description: "One message per line, as JSON" },
} as const satisfies Flags;

export const smsListCommand: Command = defineCommand({
  name: "sms list",
  summary: "List text messages",
  description: "Lists the environment's messages, newest first.",
  flags: LIST_FLAGS,
  run: async ({ values, context }: CommandInput<typeof LIST_FLAGS>) => {
    const status = oneOf("--status", values.status, STATUSES);
    const coss = await client(context);
    const { data, error } = await coss.sms.list({
      ...(values.to !== undefined && { to: values.to }),
      ...(status && { status }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the messages", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No messages.",
      header: ["ID", "STATUS", "FROM", "TO", "CREATED"],
      row: (item) => [
        item.id,
        out.style(statusStyle(item.status), item.status),
        item.from,
        item.to,
        when(item.created_at),
      ],
      more: data.has_more && "There are more: `coss api sms --paginate` lists them all.",
    });
    return 0;
  },
});

const GET_FLAGS = {
  json: { type: "boolean", description: "Print the message and its events as JSON" },
} as const satisfies Flags;

export const smsGetCommand: Command = defineCommand({
  name: "sms get",
  summary: "Show a text message and its delivery events",
  usage: "<message>",
  description: "Shows a message: its text, status, failure and delivery events.",
  flags: GET_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof GET_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "sms get <message>") as [string];
    const coss = await client(context);
    const [message, events] = await Promise.all([coss.sms.get(id), coss.sms.listEvents(id)]);
    if (message.error) throw apiError("Couldn't read the message", message.error);
    if (events.error) throw apiError("Couldn't read the message's events", events.error);
    const { out } = context;
    if (out.json) {
      out.data({ ...message.data, events: events.data.data });
      return 0;
    }
    const sms = message.data;
    out.line(`${sms.id} ${out.style(statusStyle(sms.status), sms.status)} ${sms.from} → ${sms.to}`);
    if (sms.failure) out.line(`  ${sms.failure.code}: ${sms.failure.message}`);
    out.line(`  ${printable(sms.body)}`);
    for (const event of events.data.data) {
      const failure = event.data.failure ? `  ${event.data.failure.code}` : "";
      out.line(`  ${out.style("dim", event.occurred_at)}  ${event.type}${failure}`);
    }
    return 0;
  },
});

const RECEIVED_FLAGS = {
  from: { type: "string", value: "<number>", description: "Only from this number" },
  to: { type: "string", value: "<number>", description: "Only to this number of yours" },
  limit: LIMIT,
  json: { type: "boolean", description: "One message per line, as JSON" },
} as const satisfies Flags;

export const smsReceivedCommand: Command = defineCommand({
  name: "sms received",
  summary: "List text messages sent to your numbers",
  description: "Lists messages your numbers received, newest first. Anyone can write their text.",
  flags: RECEIVED_FLAGS,
  run: async ({ values, context }: CommandInput<typeof RECEIVED_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.sms.received.list({
      ...(values.from !== undefined && { from: values.from }),
      ...(values.to !== undefined && { to: values.to }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the received messages", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No received messages.",
      header: ["ID", "FROM", "TO", "TEXT", "RECEIVED"],
      row: (item) => [item.id, item.from, item.to, printable(item.body), when(item.created_at)],
    });
    return 0;
  },
});

const NUMBERS_FLAGS = {
  json: { type: "boolean", description: "One number per line, as JSON" },
} as const satisfies Flags;

export const smsNumbersCommand: Command = defineCommand({
  name: "sms numbers",
  summary: "List your numbers and whether each can send",
  description: "Lists the organization's numbers, their registration and whether each can send.",
  flags: NUMBERS_FLAGS,
  run: async ({ context }: CommandInput<typeof NUMBERS_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.sms.numbers.list();
    if (error) throw apiError("Couldn't list the numbers", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No numbers. Buy one in the dashboard: `coss open` then SMS.",
      header: ["NUMBER", "KIND", "COUNTRY", "REGISTRATION", "CAN SEND"],
      row: (item) => [
        item.phone_number,
        item.kind,
        item.country,
        item.registration_status ?? "",
        item.can_send ? out.style("green", "yes") : out.style("yellow", "no"),
      ],
    });
    return 0;
  },
});

const SUPPRESSIONS_FLAGS = {
  number: { type: "string", value: "<number>", description: "Only this number" },
  limit: LIMIT,
  json: { type: "boolean", description: "One suppression per line, as JSON" },
} as const satisfies Flags;

export const smsSuppressionsListCommand: Command = defineCommand({
  name: "sms suppressions list",
  summary: "List numbers that won't be texted",
  description: "Lists suppressed numbers: opted out with STOP, added by you, or invalid.",
  flags: SUPPRESSIONS_FLAGS,
  run: async ({ values, context }: CommandInput<typeof SUPPRESSIONS_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.sms.suppressions.list({
      ...(values.number !== undefined && { phone_number: values.number }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the suppressions", error);
    printList(context.out, data.data, {
      empty: "No suppressions.",
      header: ["ID", "NUMBER", "REASON", "SINCE"],
      row: (item) => [item.id, item.phone_number, item.reason, when(item.created_at)],
    });
    return 0;
  },
});

const SUPPRESSION_FLAGS = {
  json: { type: "boolean", description: "Print the answer as JSON" },
} as const satisfies Flags;

export const smsSuppressionsAddCommand: Command = defineCommand({
  name: "sms suppressions add",
  summary: "Stop texting a number",
  usage: "<number>",
  description: "Adds a number, in E.164 form, to the environment's suppressions.",
  flags: SUPPRESSION_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof SUPPRESSION_FLAGS>) => {
    const [number] = requireArgs(positionals, 1, "sms suppressions add <number>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.sms.suppressions.add({ phone_number: number });
    if (error) throw apiError("Couldn't add the suppression", error);
    if (context.out.json) context.out.data(data);
    else context.out.line(`${context.out.style("green", "✔")} ${data.id} ${data.phone_number}`);
    return 0;
  },
});

export const smsSuppressionsRemoveCommand: Command = defineCommand({
  name: "sms suppressions remove",
  summary: "Text a suppressed number again",
  usage: "<suppression>",
  description:
    "Removes a suppression, by id (`coss sms suppressions list`). Someone who texted STOP asked not to be contacted.",
  flags: SUPPRESSION_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof SUPPRESSION_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "sms suppressions remove <suppression>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.sms.suppressions.remove(id);
    if (error) throw apiError("Couldn't remove the suppression", error);
    if (context.out.json) context.out.data(data);
    else context.out.line(`${context.out.style("green", "✔")} Removed ${data.id}`);
    return 0;
  },
});

export const SMS_COMMANDS: readonly Command[] = [
  smsSendCommand,
  smsListCommand,
  smsGetCommand,
  smsReceivedCommand,
  smsNumbersCommand,
  smsSuppressionsListCommand,
  smsSuppressionsAddCommand,
  smsSuppressionsRemoveCommand,
];
