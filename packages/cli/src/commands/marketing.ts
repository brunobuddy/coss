/** `coss contacts …`, `coss broadcasts …`: marketing email's contacts and sends, on the public API. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  Broadcast,
  BroadcastStatus,
  Contact,
  ContactStatus,
  CreateBroadcastParams,
} from "coss";
import { type Flags, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { clientFor, resolveCredentials } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import type { Output, Style } from "../output.ts";
import { client, confirmLive, LIMIT, limitOf, oneOf, printList, when } from "./list-output.ts";

const CONTACT_STATUSES: readonly ContactStatus[] = ["subscribed", "unsubscribed", "pending"];
const BROADCAST_STATUSES: readonly BroadcastStatus[] = [
  "draft",
  "scheduled",
  "sending",
  "paused",
  "sent",
  "canceled",
  "failed",
];

function contactStyle(status: ContactStatus): Style {
  if (status === "subscribed") return "green";
  return status === "pending" ? "yellow" : "dim";
}

function broadcastStyle(status: BroadcastStatus): Style {
  if (status === "sent") return "green";
  if (status === "failed" || status === "canceled") return "red";
  return "yellow";
}

function contactName(contact: Contact): string {
  return printable([contact.first_name, contact.last_name].filter(Boolean).join(" "));
}

function printBroadcast(out: Output, broadcast: Broadcast): void {
  out.line(
    `${broadcast.id} ${out.style(broadcastStyle(broadcast.status), broadcast.status)} ${printable(broadcast.name)}`,
  );
  out.line(`  From     ${printable(broadcast.from)}`);
  out.line(`  Subject  ${printable(broadcast.subject)}`);
  const target = broadcast.audience_id ?? broadcast.segment_id;
  if (target) {
    out.line(
      `  To       ${target}${broadcast.recipients_estimated === null ? "" : ` (about ${broadcast.recipients_estimated})`}`,
    );
  }
  if (broadcast.scheduled_at) out.line(`  At       ${when(broadcast.scheduled_at)}`);
  if (broadcast.pause_reason) out.line(`  Paused   ${broadcast.pause_reason}`);
  if (broadcast.error) out.line(`  ${broadcast.error.code}: ${broadcast.error.message}`);
  const { stats } = broadcast;
  if (stats.recipients > 0) {
    out.line(
      `  Sent ${stats.sent} of ${stats.recipients}, delivered ${stats.delivered}, bounced ${stats.bounced}, complained ${stats.complained}, opened ${stats.opened}, clicked ${stats.clicked}, unsubscribed ${stats.unsubscribed}`,
    );
  }
}

const CONTACTS_LIST_FLAGS = {
  email: { type: "string", value: "<address>", description: "Only this address" },
  status: {
    type: "string",
    value: "<status>",
    choices: CONTACT_STATUSES,
    description: "subscribed, unsubscribed or pending",
  },
  audience: { type: "string", value: "<audience>", description: "Only members of this audience" },
  limit: LIMIT,
  json: { type: "boolean", description: "One contact per line, as JSON" },
} as const satisfies Flags;

const contactsList: Command = defineCommand({
  name: "contacts list",
  summary: "List marketing contacts",
  description: "Lists the environment's contacts, newest first.",
  flags: CONTACTS_LIST_FLAGS,
  run: async ({ values, context }: CommandInput<typeof CONTACTS_LIST_FLAGS>) => {
    const status = oneOf("--status", values.status, CONTACT_STATUSES);
    const coss = await client(context);
    const { data, error } = await coss.email.contacts.list({
      ...(values.email !== undefined && { email: values.email }),
      ...(status && { status }),
      ...(values.audience !== undefined && { audience_id: values.audience }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the contacts", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No contacts.",
      header: ["ID", "EMAIL", "STATUS", "NAME", "CREATED"],
      row: (item) => [
        item.id,
        printable(item.email),
        out.style(contactStyle(item.status), item.status),
        contactName(item),
        when(item.created_at),
      ],
      more: data.has_more && "There are more: `coss api contacts --paginate` lists them all.",
    });
    return 0;
  },
});

const CONTACT_FLAGS = {
  json: { type: "boolean", description: "Print the contact as JSON" },
} as const satisfies Flags;

const contactsGet: Command = defineCommand({
  name: "contacts get",
  summary: "Show a contact",
  usage: "<contact>",
  description: "Shows a contact, by id or address, with its properties.",
  flags: CONTACT_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof CONTACT_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "contacts get <contact>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.contacts.get(id);
    if (error) throw apiError("Couldn't read the contact", error);
    const { out } = context;
    if (out.json) {
      out.data(data);
      return 0;
    }
    out.line(
      `${data.id} ${printable(data.email)} ${out.style(contactStyle(data.status), data.status)}`,
    );
    const name = contactName(data);
    if (name) out.line(`  ${name}`);
    for (const [key, value] of Object.entries(data.properties)) {
      out.line(`  ${printable(key)}: ${printable(String(value))}`);
    }
    return 0;
  },
});

const CONTACTS_ADD_FLAGS = {
  "first-name": { type: "string", value: "<name>", description: "Their first name" },
  "last-name": { type: "string", value: "<name>", description: "Their last name" },
  audience: {
    type: "string",
    multiple: true,
    value: "<audience>",
    description: "Add them to this audience (repeatable)",
  },
  "double-opt-in": { type: "boolean", description: "Email them to confirm first" },
  json: { type: "boolean", description: "Print the contact as JSON" },
} as const satisfies Flags;

const contactsAdd: Command = defineCommand({
  name: "contacts add",
  summary: "Create or update a contact",
  usage: "<email> [options]",
  description:
    "Creates the contact with this address, or updates it. Only add people who agreed to hear from you.",
  flags: CONTACTS_ADD_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof CONTACTS_ADD_FLAGS>) => {
    const [email] = requireArgs(positionals, 1, "contacts add <email>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.contacts.upsert({
      email,
      ...(values["first-name"] !== undefined && { first_name: values["first-name"] }),
      ...(values["last-name"] !== undefined && { last_name: values["last-name"] }),
      ...(values.audience && { audience_ids: values.audience }),
      ...(values["double-opt-in"] && { double_opt_in: true }),
    });
    if (error) throw apiError("Couldn't save the contact", error);
    const { out } = context;
    if (out.json) out.data(data);
    else out.line(`${out.style("green", "✔")} ${data.id} ${printable(data.email)} ${data.status}`);
    return 0;
  },
});

const contactsRemove: Command = defineCommand({
  name: "contacts remove",
  summary: "Delete a contact",
  usage: "<contact>",
  description: "Deletes a contact, by id or address.",
  flags: CONTACT_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof CONTACT_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "contacts remove <contact>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.contacts.remove(id);
    if (error) throw apiError("Couldn't delete the contact", error);
    if (context.out.json) context.out.data(data);
    else context.out.line(`${context.out.style("green", "✔")} Deleted ${data.id}`);
    return 0;
  },
});

const BROADCASTS_LIST_FLAGS = {
  status: {
    type: "string",
    value: "<status>",
    choices: BROADCAST_STATUSES,
    description: "draft, scheduled, sending, paused, sent, canceled or failed",
  },
  limit: LIMIT,
  json: { type: "boolean", description: "One broadcast per line, as JSON" },
} as const satisfies Flags;

const broadcastsList: Command = defineCommand({
  name: "broadcasts list",
  summary: "List marketing sends",
  description: "Lists broadcasts, newest first.",
  flags: BROADCASTS_LIST_FLAGS,
  run: async ({ values, context }: CommandInput<typeof BROADCASTS_LIST_FLAGS>) => {
    const status = oneOf("--status", values.status, BROADCAST_STATUSES);
    const coss = await client(context);
    const { data, error } = await coss.email.broadcasts.list({
      ...(status && { status }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the broadcasts", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No broadcasts.",
      header: ["ID", "STATUS", "NAME", "SENT", "CREATED"],
      row: (item) => [
        item.id,
        out.style(broadcastStyle(item.status), item.status),
        printable(item.name),
        item.stats.recipients > 0 ? `${item.stats.sent}/${item.stats.recipients}` : "",
        when(item.created_at),
      ],
      more: data.has_more && "There are more: `coss api broadcasts --paginate` lists them all.",
    });
    return 0;
  },
});

const BROADCAST_FLAGS = {
  json: { type: "boolean", description: "Print the broadcast as JSON" },
} as const satisfies Flags;

const broadcastsGet: Command = defineCommand({
  name: "broadcasts get",
  summary: "Show a broadcast and its counts",
  usage: "<broadcast>",
  description: "Shows a broadcast's sender, subject, audience and delivery counts.",
  flags: BROADCAST_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof BROADCAST_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "broadcasts get <broadcast>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.broadcasts.get(id);
    if (error) throw apiError("Couldn't read the broadcast", error);
    if (context.out.json) context.out.data(data);
    else printBroadcast(context.out, data);
    return 0;
  },
});

const CREATE_FLAGS = {
  name: { type: "string", value: "<name>", description: "Its name in the dashboard" },
  from: { type: "string", value: "<address>", description: "Sender, on a verified domain" },
  subject: { type: "string", value: "<subject>", description: "The subject" },
  html: { type: "string", value: "<file>", description: "A file with the HTML" },
  text: { type: "string", value: "<file>", description: "A file with the text" },
  audience: { type: "string", value: "<audience>", description: "Send to this audience" },
  segment: { type: "string", value: "<segment>", description: "Send to this segment" },
  topic: { type: "string", value: "<topic>", description: "Only contacts opted in to this topic" },
  json: { type: "boolean", description: "Print the broadcast as JSON" },
} as const satisfies Flags;

const broadcastsCreate: Command = defineCommand({
  name: "broadcasts create",
  summary: "Create a draft broadcast",
  description:
    "Creates a draft from --html and --text files. Nothing goes out: try it with `coss broadcasts test`, then `coss broadcasts send`.",
  flags: CREATE_FLAGS,
  run: async ({ values, context }: CommandInput<typeof CREATE_FLAGS>) => {
    const { name, from, subject } = values;
    if (!name || !from || !subject) {
      throw new UsageError("A broadcast needs --name, --from and --subject.");
    }
    if (!values.html && !values.text) throw new UsageError("Pass --html <file> or --text <file>.");
    const read = async (flag: string, file: string) => {
      try {
        return await readFile(resolve(context.io.cwd, file), "utf8");
      } catch {
        throw new UsageError(`Couldn't read ${file} (${flag}).`);
      }
    };
    const params: CreateBroadcastParams = {
      name,
      from,
      subject,
      send: false,
      ...(values.html && { html: await read("--html", values.html) }),
      ...(values.text && { text: await read("--text", values.text) }),
      ...(values.audience && { audience_id: values.audience }),
      ...(values.segment && { segment_id: values.segment }),
      ...(values.topic && { topic: values.topic }),
    };
    const coss = await client(context);
    const { data, error } = await coss.email.broadcasts.create(params);
    if (error) throw apiError("Couldn't create the broadcast", error);
    const { out } = context;
    if (out.json) out.data(data);
    else {
      printBroadcast(out, data);
      out.info(out.style("dim", `Next: coss broadcasts test ${data.id} --to you@example.com`));
    }
    return 0;
  },
});

const TEST_FLAGS = {
  to: {
    type: "string",
    multiple: true,
    value: "<address>",
    description: "Send the test here (repeatable)",
  },
  contact: { type: "string", value: "<contact>", description: "Render it for this contact" },
  json: { type: "boolean", description: "Print the test's email ids as JSON" },
} as const satisfies Flags;

const broadcastsTest: Command = defineCommand({
  name: "broadcasts test",
  summary: "Send a test of a broadcast",
  usage: "<broadcast> --to <address>",
  description: "Sends the broadcast to the addresses given, without touching its audience.",
  flags: TEST_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof TEST_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "broadcasts test <broadcast> --to <address>") as [
      string,
    ];
    if (!values.to?.length) throw new UsageError("Pass --to <address>.");
    const coss = await client(context);
    const { data, error } = await coss.email.broadcasts.test(id, {
      to: values.to,
      ...(values.contact && { contact: values.contact }),
    });
    if (error) throw apiError("Couldn't send the test", error);
    const { out } = context;
    if (out.json) out.data(data);
    else out.line(`${out.style("green", "✔")} Sent ${data.email_ids.join(", ")}`);
    return 0;
  },
});

const SEND_FLAGS = {
  at: { type: "string", value: "<time>", description: "Send at this ISO 8601 time" },
  yes: { type: "boolean", description: "Don't ask before a live send" },
  json: { type: "boolean", description: "Print the broadcast as JSON" },
} as const satisfies Flags;

const broadcastsSend: Command = defineCommand({
  name: "broadcasts send",
  summary: "Send a broadcast to its audience (--at to schedule it)",
  usage: "<broadcast> [options]",
  description:
    "Sends the draft to everyone in its audience or segment. With a live key it asks first; off a terminal it needs --yes.",
  flags: SEND_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof SEND_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "broadcasts send <broadcast>") as [string];
    const credentials = await resolveCredentials(context);
    const coss = clientFor(context.io, credentials);
    if (credentials.apiKey.startsWith("coss_live_") && !values.yes && context.io.stdinIsTTY) {
      const current = await coss.email.broadcasts.get(id);
      if (current.error) throw apiError("Couldn't read the broadcast", current.error);
      printBroadcast(context.out, current.data);
    }
    const go = await confirmLive(
      context,
      credentials.apiKey,
      values.yes,
      `Send ${id} to everyone in its audience?`,
    );
    if (!go) return 1;
    const { data, error } = await coss.email.broadcasts.send(
      id,
      values.at ? { scheduled_at: values.at } : {},
    );
    if (error) throw apiError("Couldn't send the broadcast", error);
    if (context.out.json) context.out.data(data);
    else printBroadcast(context.out, data);
    return 0;
  },
});

const broadcastsCancel: Command = defineCommand({
  name: "broadcasts cancel",
  summary: "Stop a scheduled or sending broadcast",
  usage: "<broadcast>",
  description: "Stops a scheduled or sending broadcast. What already went out stays sent.",
  flags: BROADCAST_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof BROADCAST_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "broadcasts cancel <broadcast>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.broadcasts.cancel(id);
    if (error) throw apiError("Couldn't cancel the broadcast", error);
    if (context.out.json) context.out.data(data);
    else printBroadcast(context.out, data);
    return 0;
  },
});

export const MARKETING_COMMANDS: readonly Command[] = [
  contactsList,
  contactsGet,
  contactsAdd,
  contactsRemove,
  broadcastsList,
  broadcastsGet,
  broadcastsCreate,
  broadcastsTest,
  broadcastsSend,
  broadcastsCancel,
];
