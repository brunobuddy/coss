/** `coss contacts …`, `coss broadcasts …`: marketing email's contacts and sends, on the public API. */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  Broadcast,
  BroadcastStatus,
  Contact,
  ContactPropertyType,
  ContactStatus,
  CreateBroadcastParams,
  UpdateBroadcastParams,
  UpdateContactParams,
} from "coss";
import { type Flags, jsonOrString, pairs, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import {
  type ContactsFile,
  contactsFromCsv,
  contactsFromJson,
  isJsonContacts,
} from "../contacts-file.ts";
import { type Context, clientFor, resolveCredentials } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, CliError, UsageError } from "../errors.ts";
import { jsonObject } from "../fields.ts";
import type { Output, Style } from "../output.ts";
import {
  client,
  confirmLive,
  fileText,
  LIMIT,
  limitOf,
  oneOf,
  orNull,
  printDeleted,
  printList,
  printOne,
  when,
} from "./list-output.ts";

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

export function contactStyle(status: ContactStatus): Style {
  if (status === "subscribed") return "green";
  return status === "pending" ? "yellow" : "dim";
}

function broadcastStyle(status: BroadcastStatus): Style {
  if (status === "sent") return "green";
  if (status === "failed" || status === "canceled") return "red";
  return "yellow";
}

export function contactName(contact: Contact): string {
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

const CONTACTS_UPDATE_FLAGS = {
  "first-name": { type: "string", value: "<name>", description: 'Their first name ("" clears it)' },
  "last-name": { type: "string", value: "<name>", description: 'Their last name ("" clears it)' },
  status: {
    type: "string",
    value: "<status>",
    choices: ["subscribed", "unsubscribed"],
    description: "subscribed or unsubscribed; only resubscribe people who asked to be",
  },
  property: {
    type: "string",
    multiple: true,
    value: "<name=value>",
    description: "A custom property (repeatable; values are JSON when they parse; null removes it)",
  },
  data: {
    type: "string",
    value: "<json>",
    description:
      "More of the request body (topics), as JSON: inline, @file or - for stdin; the flags above " +
      "win over it",
  },
  json: { type: "boolean", description: "Print the contact as JSON" },
} as const satisfies Flags;

const contactsUpdate: Command = defineCommand({
  name: "contacts update",
  summary: "Change a contact's name, status or properties",
  usage: "<contact> [options]",
  description: "Changes what is given on a contact, by id or address; the rest stays.",
  flags: CONTACTS_UPDATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof CONTACTS_UPDATE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "contacts update <contact> [options]") as [string];
    const status = oneOf("--status", values.status, ["subscribed", "unsubscribed"] as const);
    const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
    const properties = values.property && {
      properties: {
        ...(base.properties as Record<string, unknown> | undefined),
        ...Object.fromEntries(
          pairs(values.property, "property").map(([name, raw]) => [name, jsonOrString(raw)]),
        ),
      },
    };
    const params = {
      ...base,
      ...(values["first-name"] !== undefined && { first_name: orNull(values["first-name"], "") }),
      ...(values["last-name"] !== undefined && { last_name: orNull(values["last-name"], "") }),
      ...(status && { status }),
      ...properties,
    } as UpdateContactParams;
    if (Object.keys(params).length === 0) {
      throw new UsageError("Pass at least one thing to change (coss contacts update --help).");
    }
    const coss = await client(context);
    const { data, error } = await coss.email.contacts.update(id, params);
    if (error) throw apiError("Couldn't change the contact", error);
    const { out } = context;
    if (out.json) out.data(data);
    else out.line(`${out.style("green", "✔")} ${data.id} ${printable(data.email)} ${data.status}`);
    return 0;
  },
});

const CONTACTS_IMPORT_FLAGS = {
  audience: {
    type: "string",
    value: "<audience>",
    description: "Add every imported contact to this audience",
  },
  json: { type: "boolean", description: "Print what the import did as JSON" },
} as const satisfies Flags;

/** The file's contacts; only a CSV asks for the properties its columns may name. */
async function contactsFile(context: Context, file: string): Promise<ContactsFile> {
  const text =
    file === "-" ? await context.io.readStdin() : await fileText(context, "<file>", file);
  if (isJsonContacts(text)) return contactsFromJson(text);
  const coss = await client(context);
  const { data, error } = await coss.email.contacts.properties.list();
  if (error) throw apiError("Couldn't read the contact properties", error);
  const types = new Map<string, ContactPropertyType>(
    data.data.map((item) => [item.key, item.type]),
  );
  return contactsFromCsv(text, types);
}

const contactsImport: Command = defineCommand({
  name: "contacts import",
  summary: "Create or update contacts from a CSV or JSON file",
  usage: "<file> [--audience <audience>]",
  description:
    "Creates or updates contacts from a CSV (what `coss contacts export` writes, or any file with " +
    "an email column; columns named after custom properties set them) or a JSON array; - reads " +
    "stdin. Only import people who agreed to hear from you. An import never resubscribes an " +
    "unsubscribed contact, and running it again is safe. Rows it can't use are skipped and " +
    "listed, and then it exits 1.",
  flags: CONTACTS_IMPORT_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof CONTACTS_IMPORT_FLAGS>) => {
    const [file] = requireArgs(positionals, 1, "contacts import <file>") as [string];
    const { contacts, ignored } = await contactsFile(context, file);
    const { out } = context;
    if (ignored.length > 0) {
      out.warn(`Not imported, no such property: ${printable(ignored.join(", "))}.`);
    }
    const coss = await client(context);
    const { data, error } = await coss.email.contacts.import({
      contacts,
      ...(values.audience !== undefined && { audience_id: values.audience }),
    });
    if (error) throw apiError("Couldn't import the contacts", error);
    if (out.json) out.data(data);
    else {
      out.line(
        `${out.style("green", "✔")} ${data.created} created, ${data.updated} updated, ${data.kept_unsubscribed} kept unsubscribed`,
      );
      for (const entry of data.invalid) {
        out.warn(`Skipped ${printable(entry.email)}: ${printable(entry.message)}`);
      }
    }
    return data.invalid.length > 0 ? 1 : 0;
  },
});

const CONTACTS_EXPORT_FLAGS = {
  status: {
    type: "string",
    value: "<status>",
    choices: CONTACT_STATUSES,
    description: "subscribed, unsubscribed or pending",
  },
  audience: { type: "string", value: "<audience>", description: "Only members of this audience" },
  out: { type: "string", value: "<file>", description: "Where to save it (default: stdout)" },
  json: { type: "boolean", description: "Print where it was saved, or the CSV, as JSON" },
} as const satisfies Flags;

const contactsExport: Command = defineCommand({
  name: "contacts export",
  summary: "Print or save the contacts as CSV",
  usage: "[--out <file>] [options]",
  description:
    "Prints the contacts as CSV, one column per custom property, or saves them with --out. " +
    "`coss contacts import` takes the file again.",
  flags: CONTACTS_EXPORT_FLAGS,
  run: async ({ values, context }: CommandInput<typeof CONTACTS_EXPORT_FLAGS>) => {
    const status = oneOf("--status", values.status, CONTACT_STATUSES);
    const coss = await client(context);
    const { data, error } = await coss.email.contacts.export({
      ...(status && { status }),
      ...(values.audience !== undefined && { audience_id: values.audience }),
    });
    if (error) throw apiError("Couldn't export the contacts", error);
    const { io, out } = context;
    if (values.out !== undefined) {
      const file = resolve(io.cwd, values.out);
      try {
        await writeFile(file, data, { mode: 0o600 });
      } catch (cause) {
        throw new CliError(`Couldn't write ${file}: ${(cause as Error).message}`);
      }
      if (out.json) out.data({ file, size: Buffer.byteLength(data) });
      else out.line(`${out.style("green", "✔")} Saved ${file}`);
    } else if (out.json) out.data({ csv: data });
    // People's names: a terminal gets them without escape sequences, a pipe byte for byte.
    else if (io.stdout.isTTY) out.line(printable(data.trimEnd(), true));
    else out.raw(data);
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
    const params: CreateBroadcastParams = {
      name,
      from,
      subject,
      send: false,
      ...(values.html && { html: await fileText(context, "--html", values.html) }),
      ...(values.text && { text: await fileText(context, "--text", values.text) }),
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

const BROADCAST_UPDATE_FLAGS = {
  name: { type: "string", value: "<name>", description: "Its name in the dashboard" },
  from: { type: "string", value: "<address>", description: "Sender, on a verified domain" },
  subject: { type: "string", value: "<subject>", description: "The subject" },
  html: { type: "string", value: "<file>", description: "A file with the HTML" },
  text: { type: "string", value: "<file>", description: "A file with the text" },
  audience: { type: "string", value: "<audience>", description: "Send to this audience instead" },
  segment: { type: "string", value: "<segment>", description: "Send to this segment instead" },
  topic: {
    type: "string",
    value: "<topic>",
    description: "Only contacts opted in to this topic (none: everyone)",
  },
  data: {
    type: "string",
    value: "<json>",
    description:
      "More of the request body (reply_to, preview_text, tracking, rate_per_second), as JSON: " +
      "inline, @file or - for stdin; the flags above win over it",
  },
  json: { type: "boolean", description: "Print the broadcast as JSON" },
} as const satisfies Flags;

const broadcastsUpdate: Command = defineCommand({
  name: "broadcasts update",
  summary: "Change a draft broadcast",
  usage: "<broadcast> [options]",
  description: "Changes what is given on a draft. Nothing goes out.",
  flags: BROADCAST_UPDATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof BROADCAST_UPDATE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "broadcasts update <broadcast> [options]") as [string];
    const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
    const params = {
      ...base,
      ...(values.name !== undefined && { name: values.name }),
      ...(values.from !== undefined && { from: values.from }),
      ...(values.subject !== undefined && { subject: values.subject }),
      ...(values.html !== undefined && { html: await fileText(context, "--html", values.html) }),
      ...(values.text !== undefined && { text: await fileText(context, "--text", values.text) }),
      ...(values.audience !== undefined && { audience_id: values.audience }),
      ...(values.segment !== undefined && { segment_id: values.segment }),
      ...(values.topic !== undefined && { topic: orNull(values.topic, "none") }),
    } as UpdateBroadcastParams;
    if (Object.keys(params).length === 0) {
      throw new UsageError("Pass at least one thing to change (coss broadcasts update --help).");
    }
    const coss = await client(context);
    const { data, error } = await coss.email.broadcasts.update(id, params);
    if (error) throw apiError("Couldn't change the broadcast", error);
    printOne(context.out, data, printBroadcast);
    return 0;
  },
});

const broadcastsRemove: Command = defineCommand({
  name: "broadcasts remove",
  summary: "Delete a draft broadcast",
  usage: "<broadcast>",
  description: "Deletes a draft, or a broadcast canceled before it sent anything.",
  flags: BROADCAST_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof BROADCAST_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "broadcasts remove <broadcast>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.broadcasts.remove(id);
    if (error) throw apiError("Couldn't delete the broadcast", error);
    printDeleted(context.out, data);
    return 0;
  },
});

const broadcastsPause: Command = defineCommand({
  name: "broadcasts pause",
  summary: "Pause a scheduled or sending broadcast",
  usage: "<broadcast>",
  description:
    "Pauses a scheduled or sending broadcast; `coss broadcasts resume` picks it up again.",
  flags: BROADCAST_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof BROADCAST_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "broadcasts pause <broadcast>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.broadcasts.pause(id);
    if (error) throw apiError("Couldn't pause the broadcast", error);
    printOne(context.out, data, printBroadcast);
    return 0;
  },
});

const RESUME_FLAGS = {
  yes: { type: "boolean", description: "Don't ask before a live send" },
  json: { type: "boolean", description: "Print the broadcast as JSON" },
} as const satisfies Flags;

const broadcastsResume: Command = defineCommand({
  name: "broadcasts resume",
  summary: "Resume a paused broadcast where it stopped",
  usage: "<broadcast> [--yes]",
  description:
    "Sends the rest of a paused broadcast. With a live key it asks first; off a terminal it needs " +
    "--yes.",
  flags: RESUME_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof RESUME_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "broadcasts resume <broadcast>") as [string];
    const credentials = await resolveCredentials(context);
    const coss = clientFor(context.io, credentials);
    const { out } = context;
    if (credentials.apiKey.startsWith("coss_live_") && !values.yes && context.io.stdinIsTTY) {
      const current = await coss.email.broadcasts.get(id);
      if (current.error) throw apiError("Couldn't read the broadcast", current.error);
      // With --json, stdout stays the result.
      if (!out.json) printBroadcast(out, current.data);
    }
    const go = await confirmLive(
      context,
      credentials.apiKey,
      values.yes,
      `Send the rest of ${id} to its audience?`,
    );
    if (!go) return 1;
    const { data, error } = await coss.email.broadcasts.resume(id);
    if (error) throw apiError("Couldn't resume the broadcast", error);
    printOne(context.out, data, printBroadcast);
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
  contactsUpdate,
  contactsImport,
  contactsExport,
  contactsRemove,
  broadcastsList,
  broadcastsGet,
  broadcastsCreate,
  broadcastsUpdate,
  broadcastsRemove,
  broadcastsTest,
  broadcastsSend,
  broadcastsPause,
  broadcastsResume,
  broadcastsCancel,
];
