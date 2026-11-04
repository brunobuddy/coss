/** `coss log-drains …`: HTTPS endpoints the environment's log is streamed to, on the public API. */
import type {
  CreateLogDrainParams,
  LogDrain,
  LogDrainAuthHeader,
  LogDrainFormat,
  LogDrainSource,
  UpdateLogDrainParams,
} from "coss";
import { type Flags, list as listOf, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import type { Context } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import type { Output } from "../output.ts";
import {
  client,
  eitherOf,
  oneOf,
  orNull,
  printDeleted,
  printList,
  printOne,
  secretInput,
} from "./list-output.ts";

const SOURCES: readonly LogDrainSource[] = ["api", "email", "webhook", "audit"];
const FORMATS: readonly LogDrainFormat[] = ["ndjson", "loki", "datadog", "otlp"];

function sourcesOf(values: string[] | undefined): LogDrainSource[] | undefined {
  if (!values) return undefined;
  return listOf(values).map((source) => oneOf("--source", source, SOURCES) as LogDrainSource);
}

function stateOf(out: Output, drain: LogDrain): string {
  if (drain.enabled) return out.style("green", "enabled");
  return out.style(drain.disabled_reason === "failing" ? "red" : "yellow", "disabled");
}

function printDrain(out: Output, drain: LogDrain): void {
  out.line(`${drain.id} ${stateOf(out, drain)} ${printable(drain.url)}`);
  if (drain.description) out.line(`  ${printable(drain.description)}`);
  out.line(`  Format   ${drain.format}`);
  out.line(`  Sources  ${drain.sources.length > 0 ? drain.sources.join(", ") : "every source"}`);
  if (drain.auth_header_name) out.line(`  Header   ${printable(drain.auth_header_name)}`);
  if (drain.disabled_reason === "failing") {
    out.line("  A batch failed every attempt, so coss.com disabled it.");
  }
}

/** `--auth-header` names the header; its value never comes from a flag. */
async function authHeaderOf(
  context: Context,
  name: string | undefined,
): Promise<LogDrainAuthHeader | undefined> {
  if (name === undefined) return undefined;
  return { name, value: await secretInput(context, `the value of ${name}`, "--auth-header") };
}

const LIST_FLAGS = {
  json: { type: "boolean", description: "One drain per line, as JSON" },
} as const satisfies Flags;

const list: Command = defineCommand({
  name: "log-drains list",
  summary: "List where the environment's log is streamed",
  description: "Lists the environment's log drains, oldest first. Secrets are never included.",
  flags: LIST_FLAGS,
  run: async ({ context }: CommandInput<typeof LIST_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.logDrains.list();
    if (error) throw apiError("Couldn't list the log drains", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No log drains.",
      header: ["ID", "STATE", "FORMAT", "SOURCES", "URL"],
      row: (item) => [
        item.id,
        stateOf(out, item),
        item.format,
        item.sources.length > 0 ? item.sources.join(", ") : "all",
        printable(item.url),
      ],
    });
    return 0;
  },
});

const ONE_FLAGS = {
  json: { type: "boolean", description: "Print the drain as JSON" },
} as const satisfies Flags;

const get: Command = defineCommand({
  name: "log-drains get",
  summary: "Show a log drain",
  usage: "<drain>",
  description: "Shows a log drain: its URL, format, sources and state.",
  flags: ONE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof ONE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "log-drains get <drain>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.logDrains.get(id);
    if (error) throw apiError("Couldn't read the log drain", error);
    printOne(context.out, data, printDrain);
    return 0;
  },
});

const SHARED_FLAGS = {
  description: { type: "string", value: "<text>", description: "What it's for" },
  source: {
    type: "string",
    multiple: true,
    value: "<source>",
    choices: SOURCES,
    description: "Only this source: api, email, webhook or audit (repeatable; default: all)",
  },
  format: {
    type: "string",
    value: "<format>",
    choices: FORMATS,
    description: "ndjson (the default, for your own endpoint), loki, datadog or otlp",
  },
  "auth-header": {
    type: "string",
    value: "<name>",
    description:
      "Send this header with every batch (Authorization, DD-API-KEY…). Its value is a secret, so " +
      "a terminal asks for it and anything else pipes it to stdin",
  },
} as const satisfies Flags;

const CREATE_FLAGS = {
  ...SHARED_FLAGS,
  json: { type: "boolean", description: "Print the drain, with its secret, as JSON" },
} as const satisfies Flags;

const create: Command = defineCommand({
  name: "log-drains create",
  summary: "Stream the environment's log to a URL (prints its signing secret)",
  usage: "<url> [options]",
  description:
    "Creates a log drain at an https:// URL and prints its signing secret: the only time it's " +
    "shown. Creation is never retried, since the API doesn't deduplicate it.",
  flags: CREATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof CREATE_FLAGS>) => {
    const [url] = requireArgs(positionals, 1, "log-drains create <url>") as [string];
    const format = oneOf("--format", values.format, FORMATS);
    const sources = sourcesOf(values.source);
    const header = await authHeaderOf(context, values["auth-header"]);
    const params: CreateLogDrainParams = {
      url,
      ...(values.description !== undefined && { description: values.description }),
      ...(sources && { sources }),
      ...(format && { format }),
      ...(header && { auth_header: header }),
    };
    const coss = await client(context);
    const { data, error } = await coss.logDrains.create(params);
    if (error) throw apiError("Couldn't create the log drain", error);
    const { out } = context;
    if (out.json) {
      out.data(data);
      return 0;
    }
    printDrain(out, data);
    out.line(`  Signing secret: ${out.style("bold", data.secret)}`);
    out.info(out.style("dim", "Save the secret now: your endpoint verifies batches with it."));
    return 0;
  },
});

const UPDATE_FLAGS = {
  url: { type: "string", value: "<url>", description: "Its new https:// URL" },
  ...SHARED_FLAGS,
  "remove-auth-header": { type: "boolean", description: "Stop sending the auth header" },
  enabled: { type: "boolean", description: "Send lines logged from now on" },
  disabled: {
    type: "boolean",
    description: "Stop sending; the lines still waiting for it are dropped",
  },
  json: { type: "boolean", description: "Print the drain as JSON" },
} as const satisfies Flags;

const update: Command = defineCommand({
  name: "log-drains update",
  summary: "Change a log drain, or enable or disable it",
  usage: "<drain> [options]",
  description:
    "Changes what is given; the signing secret stays the same. --description none clears the " +
    "description. --enabled also brings back a drain coss.com disabled for failing.",
  flags: UPDATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof UPDATE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "log-drains update <drain> [options]") as [string];
    const format = oneOf("--format", values.format, FORMATS);
    const sources = sourcesOf(values.source);
    const enabled = eitherOf(values.enabled, values.disabled, ["--enabled", "--disabled"]);
    if (values["auth-header"] !== undefined && values["remove-auth-header"]) {
      throw new UsageError("Pass --auth-header or --remove-auth-header, not both.");
    }
    const header = await authHeaderOf(context, values["auth-header"]);
    const params: UpdateLogDrainParams = {
      ...(values.url !== undefined && { url: values.url }),
      ...(values.description !== undefined && { description: orNull(values.description, "none") }),
      ...(sources && { sources }),
      ...(format && { format }),
      ...(header && { auth_header: header }),
      ...(values["remove-auth-header"] && { auth_header: null }),
      ...(enabled !== undefined && { enabled }),
    };
    if (Object.keys(params).length === 0) {
      throw new UsageError("Pass at least one thing to change (coss log-drains update --help).");
    }
    const coss = await client(context);
    const { data, error } = await coss.logDrains.update(id, params);
    if (error) throw apiError("Couldn't change the log drain", error);
    printOne(context.out, data, printDrain);
    return 0;
  },
});

const DELETE_FLAGS = {
  json: { type: "boolean", description: "Print the result as JSON" },
} as const satisfies Flags;

const remove: Command = defineCommand({
  name: "log-drains delete",
  summary: "Delete a log drain and its batch log",
  usage: "<drain>",
  description:
    "Deletes a log drain and its batch log. To pause it instead: `coss log-drains update <drain> " +
    "--disabled`.",
  flags: DELETE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof DELETE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "log-drains delete <drain>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.logDrains.delete(id);
    if (error) throw apiError("Couldn't delete the log drain", error);
    printDeleted(context.out, data);
    return 0;
  },
});

export const LOG_DRAINS_COMMANDS: readonly Command[] = [list, get, create, update, remove];
