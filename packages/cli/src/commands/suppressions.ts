/** `coss suppressions …`: the addresses the environment's emails skip, on the public API. */
import type { Suppression } from "coss";
import { type Flags, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { printable } from "../emails/format.ts";
import { apiError } from "../errors.ts";
import type { Output } from "../output.ts";
import {
  client,
  LIMIT,
  limitOf,
  oneOf,
  printDeleted,
  printList,
  printOne,
  when,
} from "./list-output.ts";

const STREAMS = ["transactional", "marketing"] as const;

const SUBACCOUNT = {
  type: "string",
  value: "<subaccount>",
  description: "A sub-account's own list (its id or uid) instead of the environment's",
} as const;

const LIST_FLAGS = {
  address: { type: "string", value: "<address>", description: "Only this address" },
  scope: { type: "string", value: "<scope>", description: "Only this scope: * or a category" },
  subaccount: SUBACCOUNT,
  limit: LIMIT,
  json: { type: "boolean", description: "One suppression per line, as JSON" },
} as const satisfies Flags;

const list: Command = defineCommand({
  name: "suppressions list",
  summary: "List addresses that won't be emailed",
  description:
    "Lists suppressed addresses, newest first: permanent bounces, complaints, unsubscribes, and " +
    "those added by you.",
  flags: LIST_FLAGS,
  run: async ({ values, context }: CommandInput<typeof LIST_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.email.suppressions.list({
      ...(values.address !== undefined && { address: values.address }),
      ...(values.scope !== undefined && { scope: values.scope }),
      ...(values.subaccount !== undefined && { subaccount: values.subaccount }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the suppressions", error);
    printList(context.out, data.data, {
      empty: "No suppressions.",
      header: ["ID", "ADDRESS", "SCOPE", "REASON", "SINCE"],
      row: (item) => [
        item.id,
        printable(item.address),
        printable(item.scope),
        item.reason,
        when(item.created_at),
      ],
      more: data.has_more && "There are more: `coss api suppressions --paginate` lists them all.",
    });
    return 0;
  },
});

const CHECK_FLAGS = {
  category: {
    type: "string",
    value: "<category>",
    description: "The category of the email you plan to send",
  },
  stream: {
    type: "string",
    value: "<stream>",
    choices: STREAMS,
    description: "The stream of the email you plan to send: transactional or marketing",
  },
  subaccount: {
    type: "string",
    value: "<subaccount>",
    description: "The sub-account you plan to send for (its id or uid)",
  },
  json: { type: "boolean", description: "Print the answer as JSON" },
} as const satisfies Flags;

const check: Command = defineCommand({
  name: "suppressions check",
  summary: "Check whether a send to an address would be skipped",
  usage: "<address> [options]",
  description:
    "Says whether an email to this address would be skipped, and which entries match. Without " +
    "--category or --stream, only entries that cover every email count.",
  flags: CHECK_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof CHECK_FLAGS>) => {
    const [address] = requireArgs(positionals, 1, "suppressions check <address>") as [string];
    const stream = oneOf("--stream", values.stream, STREAMS);
    const coss = await client(context);
    const { data, error } = await coss.email.suppressions.check({
      address,
      ...(values.category !== undefined && { category: values.category }),
      ...(stream && { stream }),
      ...(values.subaccount !== undefined && { subaccount: values.subaccount }),
    });
    if (error) throw apiError("Couldn't check the address", error);
    const { out } = context;
    if (out.json) {
      out.data(data);
      return 0;
    }
    if (!data.suppressed) {
      out.line(`${printable(data.address)} ${out.style("green", "isn't suppressed")}`);
      return 0;
    }
    out.line(`${printable(data.address)} ${out.style("yellow", "is suppressed")}`);
    for (const item of data.suppressions) {
      out.line(`  ${item.id}  ${printable(item.scope)}  ${item.reason}  ${when(item.created_at)}`);
    }
    return 0;
  },
});

function printSuppression(out: Output, item: Suppression): void {
  out.line(
    `${out.style("green", "✔")} ${item.id} ${printable(item.address)} ${printable(item.scope)}`,
  );
}

const ADD_FLAGS = {
  scope: {
    type: "string",
    value: "<scope>",
    description: "* (every email, the default) or a category",
  },
  subaccount: SUBACCOUNT,
  json: { type: "boolean", description: "Print the suppression as JSON" },
} as const satisfies Flags;

const add: Command = defineCommand({
  name: "suppressions add",
  summary: "Stop emailing an address",
  usage: "<address> [options]",
  description:
    "Adds an address to the list, for every email or one category. An entry that exists is " +
    "returned as it is.",
  flags: ADD_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof ADD_FLAGS>) => {
    const [address] = requireArgs(positionals, 1, "suppressions add <address>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.suppressions.add({
      address,
      ...(values.scope !== undefined && { scope: values.scope }),
      ...(values.subaccount !== undefined && { subaccount: values.subaccount }),
    });
    if (error) throw apiError("Couldn't add the suppression", error);
    printOne(context.out, data, printSuppression);
    return 0;
  },
});

const REMOVE_FLAGS = {
  json: { type: "boolean", description: "Print the result as JSON" },
} as const satisfies Flags;

const remove: Command = defineCommand({
  name: "suppressions remove",
  summary: "Email a suppressed address again",
  usage: "<suppression>",
  description:
    "Removes an entry, by id (`coss suppressions list`), so later sends reach the address. " +
    "Someone who complained or unsubscribed asked not to be contacted.",
  flags: REMOVE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof REMOVE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "suppressions remove <suppression>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.suppressions.remove(id);
    if (error) throw apiError("Couldn't remove the suppression", error);
    printDeleted(context.out, data, "Removed");
    return 0;
  },
});

export const SUPPRESSIONS_COMMANDS: readonly Command[] = [list, check, add, remove];
