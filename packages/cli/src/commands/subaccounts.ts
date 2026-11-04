/** `coss subaccounts …`: your users' sub-accounts (email for platforms), on the public API. */
import type {
  Coss,
  CreateSubaccountParams,
  Subaccount,
  SubaccountQuotasParams,
  UpdateSubaccountParams,
} from "coss";
import { type Flags, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import type { Output, Style } from "../output.ts";
import {
  client,
  integerOf,
  LIMIT,
  limitOf,
  oneOf,
  orNull,
  pairsOf,
  printList,
  printOne,
  when,
} from "./list-output.ts";

const STATUSES = ["active", "disabled"] as const;

function standingStyle(status: Subaccount["reputation"]["status"]): Style {
  if (status === "good") return "green";
  return status === "warning" ? "yellow" : "red";
}

function statusStyle(status: Subaccount["status"]): Style {
  return status === "active" ? "green" : status === "disabled" ? "yellow" : "red";
}

function quota(value: number | null): string {
  return value === null ? "none" : String(value);
}

function printSubaccount(out: Output, subaccount: Subaccount): void {
  out.line(
    `${subaccount.id} ${out.style(statusStyle(subaccount.status), subaccount.status)} ${printable(subaccount.name)}`,
  );
  if (subaccount.uid) out.line(`  Uid         ${printable(subaccount.uid)}`);
  const { reputation, quotas } = subaccount;
  out.line(
    `  Reputation  ${out.style(standingStyle(reputation.status), reputation.status)}${reputation.trigger ? ` (${reputation.trigger})` : ""}`,
  );
  out.line(
    `  Quotas      ${quota(quotas.recipients_per_day)} a day, ${quota(quotas.recipients_per_second)} a second, burst ${quota(quotas.burst)}`,
  );
  for (const [key, value] of Object.entries(subaccount.metadata)) {
    out.line(`  ${printable(key)}: ${printable(value)}`);
  }
}

const LIST_FLAGS = {
  limit: LIMIT,
  json: { type: "boolean", description: "One sub-account per line, as JSON" },
} as const satisfies Flags;

const list: Command = defineCommand({
  name: "subaccounts list",
  summary: "List your users' sub-accounts",
  description: "Lists the environment's sub-accounts, newest first.",
  flags: LIST_FLAGS,
  run: async ({ values, context }: CommandInput<typeof LIST_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.email.subaccounts.list({
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the sub-accounts", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No sub-accounts.",
      header: ["ID", "UID", "NAME", "STATUS", "REPUTATION", "CREATED"],
      row: (item) => [
        item.id,
        printable(item.uid ?? ""),
        printable(item.name),
        out.style(statusStyle(item.status), item.status),
        out.style(standingStyle(item.reputation.status), item.reputation.status),
        when(item.created_at),
      ],
      more: data.has_more && "There are more: `coss api subaccounts --paginate` lists them all.",
    });
    return 0;
  },
});

const ONE_FLAGS = {
  json: { type: "boolean", description: "Print the sub-account as JSON" },
} as const satisfies Flags;

function oneCommand(
  name: string,
  summary: string,
  description: string,
  failure: string,
  call: (coss: Coss, id: string) => ReturnType<Coss["email"]["subaccounts"]["get"]>,
): Command {
  return defineCommand({
    name: `subaccounts ${name}`,
    summary,
    usage: "<subaccount>",
    description,
    flags: ONE_FLAGS,
    positionals: true,
    run: async ({ positionals, context }: CommandInput<typeof ONE_FLAGS>) => {
      const [id] = requireArgs(positionals, 1, `subaccounts ${name} <subaccount>`) as [string];
      const { data, error } = await call(await client(context), id);
      if (error) throw apiError(failure, error);
      printOne(context.out, data, printSubaccount);
      return 0;
    },
  });
}

const get = oneCommand(
  "get",
  "Show a sub-account with its quotas and reputation",
  "Shows a sub-account, by its id or uid, with its quotas and reputation.",
  "Couldn't read the sub-account",
  (coss, id) => coss.email.subaccounts.get(id),
);

const remove = oneCommand(
  "delete",
  "Start deleting a sub-account",
  "Starts deleting a sub-account: its sends are refused at once, then its domains are released " +
    "and it is removed with its suppressions. It can't be undone.",
  "Couldn't delete the sub-account",
  (coss, id) => coss.email.subaccounts.delete(id),
);

const reinstate = oneCommand(
  "reinstate",
  "Lift a sub-account's reputation pause",
  "Lifts its reputation pause or warning once you fixed the cause: rates are measured again " +
    "from now on. A pause is never lifted on its own.",
  "Couldn't reinstate the sub-account",
  (coss, id) => coss.email.subaccounts.reinstate(id),
);

const QUOTA_FLAGS = {
  "per-day": {
    type: "string",
    value: "<n>",
    description: "At most this many recipients a day (none: only the organization's quota)",
  },
  "per-second": {
    type: "string",
    value: "<n>",
    description: "At most this many recipients a second (none: only the organization's quota)",
  },
  burst: {
    type: "string",
    value: "<n>",
    description: "Recipients a moment may take before the per-second rate applies (none: no limit)",
  },
} as const satisfies Flags;

function quotaOf(flag: string, value: string | undefined): number | null | undefined {
  return value === "none" ? null : integerOf(flag, value);
}

function quotasOf(values: {
  "per-day"?: string;
  "per-second"?: string;
  burst?: string;
}): SubaccountQuotasParams | undefined {
  const day = quotaOf("--per-day", values["per-day"]);
  const second = quotaOf("--per-second", values["per-second"]);
  const burst = quotaOf("--burst", values.burst);
  const quotas: SubaccountQuotasParams = {
    ...(day !== undefined && { recipients_per_day: day }),
    ...(second !== undefined && { recipients_per_second: second }),
    ...(burst !== undefined && { burst }),
  };
  return Object.keys(quotas).length > 0 ? quotas : undefined;
}

const CREATE_FLAGS = {
  uid: {
    type: "string",
    value: "<uid>",
    description: "Your own id for it, usable wherever its id is",
  },
  metadata: {
    type: "string",
    multiple: true,
    value: "<name=value>",
    description: "Metadata (repeatable)",
  },
  ...QUOTA_FLAGS,
  json: { type: "boolean", description: "Print the sub-account as JSON" },
} as const satisfies Flags;

const create: Command = defineCommand({
  name: "subaccounts create",
  summary: "Create a sub-account for one of your users",
  usage: "<name> [options]",
  description:
    "Creates a sub-account, with its own domains, suppressions, quotas and reputation. Creation " +
    "is never retried, since the API doesn't deduplicate it.",
  flags: CREATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof CREATE_FLAGS>) => {
    const [name] = requireArgs(positionals, 1, "subaccounts create <name>") as [string];
    const metadata = pairsOf(values.metadata, "metadata");
    const quotas = quotasOf(values);
    const params: CreateSubaccountParams = {
      name,
      ...(values.uid !== undefined && { uid: values.uid }),
      ...(metadata && { metadata }),
      ...(quotas && { quotas }),
    };
    const coss = await client(context);
    const { data, error } = await coss.email.subaccounts.create(params);
    if (error) throw apiError("Couldn't create the sub-account", error);
    printOne(context.out, data, printSubaccount);
    return 0;
  },
});

const UPDATE_FLAGS = {
  name: { type: "string", value: "<name>", description: "Its new name" },
  uid: { type: "string", value: "<uid>", description: "Your own id for it (none: remove it)" },
  status: {
    type: "string",
    value: "<status>",
    choices: STATUSES,
    description: "active, or disabled to refuse its sends until it's active again",
  },
  metadata: {
    type: "string",
    multiple: true,
    value: "<name=value>",
    description: "Metadata, replacing what it has (repeatable)",
  },
  ...QUOTA_FLAGS,
  json: { type: "boolean", description: "Print the sub-account as JSON" },
} as const satisfies Flags;

const update: Command = defineCommand({
  name: "subaccounts update",
  summary: "Change a sub-account's name, status or quotas",
  usage: "<subaccount> [options]",
  description: "Changes what is given; everything else keeps its value.",
  flags: UPDATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof UPDATE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "subaccounts update <subaccount> [options]") as [
      string,
    ];
    const status = oneOf("--status", values.status, STATUSES);
    const metadata = pairsOf(values.metadata, "metadata");
    const quotas = quotasOf(values);
    const params: UpdateSubaccountParams = {
      ...(values.name !== undefined && { name: values.name }),
      ...(values.uid !== undefined && { uid: orNull(values.uid, "none") }),
      ...(status && { status }),
      ...(metadata && { metadata }),
      ...(quotas && { quotas }),
    };
    if (Object.keys(params).length === 0) {
      throw new UsageError("Pass at least one thing to change (coss subaccounts update --help).");
    }
    const coss = await client(context);
    const { data, error } = await coss.email.subaccounts.update(id, params);
    if (error) throw apiError("Couldn't change the sub-account", error);
    printOne(context.out, data, printSubaccount);
    return 0;
  },
});

const STATS_FLAGS = {
  from: {
    type: "string",
    value: "<day>",
    description: "First day (UTC, YYYY-MM-DD; default 30 days before --to)",
  },
  to: { type: "string", value: "<day>", description: "Last day, included (default today)" },
  json: { type: "boolean", description: "Print the stats as JSON" },
} as const satisfies Flags;

const stats: Command = defineCommand({
  name: "subaccounts stats",
  summary: "Show a sub-account's sending per day",
  usage: "<subaccount> [options]",
  description:
    "Shows its sending per UTC day, at most the last 45 days. Days without sends are left out.",
  flags: STATS_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof STATS_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "subaccounts stats <subaccount>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.subaccounts.stats(id, {
      ...(values.from !== undefined && { from: values.from }),
      ...(values.to !== undefined && { to: values.to }),
    });
    if (error) throw apiError("Couldn't read the sub-account's stats", error);
    const { out } = context;
    if (out.json) {
      out.data(data);
      return 0;
    }
    printList(out, data.data, {
      empty: `No sends from ${data.from} to ${data.to}.`,
      header: [
        "DAY",
        "RECIPIENTS",
        "SENT",
        "DELIVERED",
        "BOUNCED",
        "COMPLAINED",
        "FAILED",
        "SUPPRESSED",
      ],
      row: (day) => [
        day.date,
        String(day.recipients),
        String(day.sent),
        String(day.delivered),
        String(day.bounced),
        String(day.complained),
        String(day.failed),
        String(day.suppressed),
      ],
    });
    return 0;
  },
});

export const SUBACCOUNTS_COMMANDS: readonly Command[] = [
  list,
  get,
  create,
  update,
  remove,
  reinstate,
  stats,
];
