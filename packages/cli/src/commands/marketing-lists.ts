/**
 * `coss audiences …`, `coss segments …`, `coss topics …`, `coss marketing settings …`: who marketing
 * email goes to and how it's signed, on the public API.
 */
import type {
  Audience,
  Contact,
  CreateTopicParams,
  List,
  MarketingSettings,
  Segment,
  SegmentFilter,
  Topic,
  UpdateMarketingSettingsParams,
  UpdateSegmentParams,
  UpdateTopicParams,
} from "coss";
import { type Flags, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import type { Context } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import { jsonObject } from "../fields.ts";
import type { Output } from "../output.ts";
import {
  client,
  eitherOf,
  fileText,
  integerOf,
  LIMIT,
  limitOf,
  oneOf,
  orNull,
  printDeleted,
  printList,
  printOne,
  when,
} from "./list-output.ts";
import { contactName, contactStyle } from "./marketing.ts";

const PAGE_FLAGS = {
  limit: LIMIT,
  json: { type: "boolean", description: "One item per line, as JSON" },
} as const satisfies Flags;

const REMOVE_FLAGS = {
  json: { type: "boolean", description: "Print the result as JSON" },
} as const satisfies Flags;

function printContacts(out: Output, page: List<Contact>, more: string): void {
  printList(out, page.data, {
    empty: "No contacts.",
    header: ["ID", "EMAIL", "STATUS", "NAME", "CREATED"],
    row: (item) => [
      item.id,
      printable(item.email),
      out.style(contactStyle(item.status), item.status),
      contactName(item),
      when(item.created_at),
    ],
    more: page.has_more && more,
  });
}

// ── Audiences ───────────────────────────────────────────────────────────────────────────────────

const AUDIENCE_FLAGS = {
  json: { type: "boolean", description: "Print the audience as JSON" },
} as const satisfies Flags;

function printAudience(out: Output, audience: Audience): void {
  out.line(`${audience.id} ${printable(audience.name)}, ${audience.contact_count} contacts`);
}

const audiencesList: Command = defineCommand({
  name: "audiences list",
  summary: "List audiences: static lists of contacts",
  description: "Lists the environment's audiences, with how many contacts each has.",
  flags: PAGE_FLAGS,
  run: async ({ values, context }: CommandInput<typeof PAGE_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.email.audiences.list({
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the audiences", error);
    printList(context.out, data.data, {
      empty: "No audiences.",
      header: ["ID", "NAME", "CONTACTS", "CREATED"],
      row: (item) => [
        item.id,
        printable(item.name),
        String(item.contact_count),
        when(item.created_at),
      ],
      more: data.has_more && "There are more: `coss api audiences --paginate` lists them all.",
    });
    return 0;
  },
});

const audiencesGet: Command = defineCommand({
  name: "audiences get",
  summary: "Show an audience",
  usage: "<audience>",
  description: "Shows an audience and how many contacts it has.",
  flags: AUDIENCE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof AUDIENCE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "audiences get <audience>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.audiences.get(id);
    if (error) throw apiError("Couldn't read the audience", error);
    printOne(context.out, data, printAudience);
    return 0;
  },
});

const audiencesCreate: Command = defineCommand({
  name: "audiences create",
  summary: "Create an audience",
  usage: "<name>",
  description: "Creates an empty audience: `coss audiences contacts add` fills it.",
  flags: AUDIENCE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof AUDIENCE_FLAGS>) => {
    const [name] = requireArgs(positionals, 1, "audiences create <name>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.audiences.create({ name });
    if (error) throw apiError("Couldn't create the audience", error);
    printOne(context.out, data, printAudience);
    return 0;
  },
});

const AUDIENCE_UPDATE_FLAGS = {
  name: { type: "string", value: "<name>", description: "Its new name" },
  json: { type: "boolean", description: "Print the audience as JSON" },
} as const satisfies Flags;

const audiencesUpdate: Command = defineCommand({
  name: "audiences update",
  summary: "Rename an audience",
  usage: "<audience> --name <name>",
  description: "Renames an audience.",
  flags: AUDIENCE_UPDATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof AUDIENCE_UPDATE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "audiences update <audience> --name <name>") as [
      string,
    ];
    if (!values.name) throw new UsageError("Pass --name <name>.");
    const coss = await client(context);
    const { data, error } = await coss.email.audiences.update(id, { name: values.name });
    if (error) throw apiError("Couldn't change the audience", error);
    printOne(context.out, data, printAudience);
    return 0;
  },
});

const audiencesRemove: Command = defineCommand({
  name: "audiences remove",
  summary: "Delete an audience (its contacts stay)",
  usage: "<audience>",
  description: "Deletes an audience. Its contacts stay.",
  flags: REMOVE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof REMOVE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "audiences remove <audience>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.audiences.remove(id);
    if (error) throw apiError("Couldn't delete the audience", error);
    printDeleted(context.out, data);
    return 0;
  },
});

const audienceContactsList: Command = defineCommand({
  name: "audiences contacts list",
  summary: "List an audience's contacts",
  usage: "<audience>",
  description: "Lists an audience's members, newest first.",
  flags: PAGE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof PAGE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "audiences contacts list <audience>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.audiences.listContacts(id, {
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the audience's contacts", error);
    if (context.out.json) for (const item of data.data) context.out.data(item);
    else {
      printContacts(
        context.out,
        data,
        `There are more: \`coss api audiences/${id}/contacts --paginate\` lists them all.`,
      );
    }
    return 0;
  },
});

const AUDIENCE_CONTACTS_ADD_FLAGS = {
  json: { type: "boolean", description: "Print what was added as JSON" },
} as const satisfies Flags;

const audienceContactsAdd: Command = defineCommand({
  name: "audiences contacts add",
  summary: "Add existing contacts to an audience",
  usage: "<audience> <contact>...",
  description:
    "Adds existing contacts, by id or address (at most 1,000 at once). It exits 1 when one of " +
    "them is no contact: `coss contacts add` or `coss contacts import` creates them.",
  flags: AUDIENCE_CONTACTS_ADD_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof AUDIENCE_CONTACTS_ADD_FLAGS>) => {
    const [id, ...contacts] = positionals;
    if (id === undefined || contacts.length === 0) {
      throw new UsageError("Usage: coss audiences contacts add <audience> <contact>...");
    }
    const coss = await client(context);
    const { data, error } = await coss.email.audiences.addContacts(id, { contacts });
    if (error) throw apiError("Couldn't add the contacts", error);
    const { out } = context;
    if (out.json) out.data(data);
    else {
      out.line(`${out.style("green", "✔")} ${data.added} added, ${data.existing} already there`);
      if (data.missing.length > 0) {
        out.warn(`No such contact: ${printable(data.missing.join(", "))}.`);
      }
    }
    return data.missing.length > 0 ? 1 : 0;
  },
});

const audienceContactsRemove: Command = defineCommand({
  name: "audiences contacts remove",
  summary: "Take a contact out of an audience",
  usage: "<audience> <contact>",
  description: "Takes a contact, by id or address, out of an audience. The contact stays.",
  flags: REMOVE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof REMOVE_FLAGS>) => {
    const [id, contact] = requireArgs(
      positionals,
      2,
      "audiences contacts remove <audience> <contact>",
    ) as [string, string];
    const coss = await client(context);
    const { data, error } = await coss.email.audiences.removeContact(id, contact);
    if (error) throw apiError("Couldn't remove the contact", error);
    const { out } = context;
    if (out.json) out.data(data);
    else out.line(`${out.style("green", "✔")} Removed ${data.contact_id} from ${data.audience_id}`);
    return 0;
  },
});

// ── Segments ────────────────────────────────────────────────────────────────────────────────────

const SEGMENT_FLAGS = {
  json: { type: "boolean", description: "Print the segment as JSON" },
} as const satisfies Flags;

function printSegment(out: Output, segment: Segment): void {
  out.line(`${segment.id} ${printable(segment.name)}`);
  // Addresses and property values someone chose: never escape sequences.
  out.line(`  Filter  ${printable(JSON.stringify(segment.filter))}`);
}

const FILTER_FLAG = {
  type: "string",
  value: "<json>",
  description:
    'The filter: {"version":1,"match":"all","conditions":[…]}, inline, @file or - for stdin',
} as const;

const segmentsList: Command = defineCommand({
  name: "segments list",
  summary: "List segments: filters over the contacts",
  description: "Lists the environment's segments, newest first.",
  flags: PAGE_FLAGS,
  run: async ({ values, context }: CommandInput<typeof PAGE_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.email.segments.list({
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the segments", error);
    printList(context.out, data.data, {
      empty: "No segments.",
      header: ["ID", "NAME", "CONDITIONS", "CREATED"],
      row: (item) => [
        item.id,
        printable(item.name),
        String(item.filter.conditions.length),
        when(item.created_at),
      ],
      more: data.has_more && "There are more: `coss api segments --paginate` lists them all.",
    });
    return 0;
  },
});

const segmentsGet: Command = defineCommand({
  name: "segments get",
  summary: "Show a segment and its filter",
  usage: "<segment>",
  description: "Shows a segment and its filter.",
  flags: SEGMENT_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof SEGMENT_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "segments get <segment>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.segments.get(id);
    if (error) throw apiError("Couldn't read the segment", error);
    printOne(context.out, data, printSegment);
    return 0;
  },
});

const SEGMENT_CREATE_FLAGS = {
  filter: FILTER_FLAG,
  json: { type: "boolean", description: "Print the segment as JSON" },
} as const satisfies Flags;

const segmentsCreate: Command = defineCommand({
  name: "segments create",
  summary: "Create a segment from a filter",
  usage: "<name> --filter <json>",
  description:
    "Creates a segment. Its filter is evaluated whenever it is used: at most 20 conditions on a " +
    "property, the email, an audience, a topic or created_at. See " +
    "https://coss.com/docs/email/audiences-and-segments",
  flags: SEGMENT_CREATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof SEGMENT_CREATE_FLAGS>) => {
    const [name] = requireArgs(positionals, 1, "segments create <name> --filter <json>") as [
      string,
    ];
    if (!values.filter) throw new UsageError("Pass --filter <json>.");
    const filter = (await jsonObject(
      context.io,
      values.filter,
      "filter",
    )) as unknown as SegmentFilter;
    const coss = await client(context);
    const { data, error } = await coss.email.segments.create({ name, filter });
    if (error) throw apiError("Couldn't create the segment", error);
    printOne(context.out, data, printSegment);
    return 0;
  },
});

const SEGMENT_UPDATE_FLAGS = {
  name: { type: "string", value: "<name>", description: "Its new name" },
  filter: FILTER_FLAG,
  json: { type: "boolean", description: "Print the segment as JSON" },
} as const satisfies Flags;

const segmentsUpdate: Command = defineCommand({
  name: "segments update",
  summary: "Change a segment's name or filter",
  usage: "<segment> [options]",
  description: "Changes a segment's name or replaces its filter.",
  flags: SEGMENT_UPDATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof SEGMENT_UPDATE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "segments update <segment> [options]") as [string];
    if (values.name === undefined && values.filter === undefined) {
      throw new UsageError("Pass --name or --filter.");
    }
    const params: UpdateSegmentParams = {
      ...(values.name !== undefined && { name: values.name }),
      ...(values.filter !== undefined && {
        filter: (await jsonObject(context.io, values.filter, "filter")) as unknown as SegmentFilter,
      }),
    };
    const coss = await client(context);
    const { data, error } = await coss.email.segments.update(id, params);
    if (error) throw apiError("Couldn't change the segment", error);
    printOne(context.out, data, printSegment);
    return 0;
  },
});

const segmentsRemove: Command = defineCommand({
  name: "segments remove",
  summary: "Delete a segment (its contacts stay)",
  usage: "<segment>",
  description: "Deletes a segment. The contacts it matched stay.",
  flags: REMOVE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof REMOVE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "segments remove <segment>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.segments.remove(id);
    if (error) throw apiError("Couldn't delete the segment", error);
    printDeleted(context.out, data);
    return 0;
  },
});

const segmentContactsList: Command = defineCommand({
  name: "segments contacts list",
  summary: "List the contacts a segment matches now",
  usage: "<segment>",
  description: "Lists the contacts the filter matches now, whatever their status, newest first.",
  flags: PAGE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof PAGE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "segments contacts list <segment>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.segments.listContacts(id, {
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the segment's contacts", error);
    if (context.out.json) for (const item of data.data) context.out.data(item);
    else {
      printContacts(
        context.out,
        data,
        `There are more: \`coss api segments/${id}/contacts --paginate\` lists them all.`,
      );
    }
    return 0;
  },
});

// ── Topics ──────────────────────────────────────────────────────────────────────────────────────

const DEFAULTS = ["opt_in", "opt_out"] as const;
const VISIBILITIES = ["public", "private"] as const;

function printTopic(out: Output, topic: Topic): void {
  out.line(`${topic.id} ${printable(topic.key)} ${printable(topic.name)}`);
  if (topic.description) out.line(`  ${printable(topic.description)}`);
  out.line(`  ${topic.default_subscription}, ${topic.visibility}, position ${topic.position}`);
}

const TOPIC_FLAGS = {
  json: { type: "boolean", description: "Print the topic as JSON" },
} as const satisfies Flags;

const topicsList: Command = defineCommand({
  name: "topics list",
  summary: "List topics: what contacts subscribe to",
  description: "Lists the environment's topics. A topic's key is a send's `category`.",
  flags: PAGE_FLAGS,
  run: async ({ values, context }: CommandInput<typeof PAGE_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.email.topics.list({
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the topics", error);
    printList(context.out, data.data, {
      empty: "No topics.",
      header: ["ID", "KEY", "NAME", "DEFAULT", "VISIBILITY"],
      row: (item) => [
        item.id,
        printable(item.key),
        printable(item.name),
        item.default_subscription,
        item.visibility,
      ],
      more: data.has_more && "There are more: `coss api topics --paginate` lists them all.",
    });
    return 0;
  },
});

const topicsGet: Command = defineCommand({
  name: "topics get",
  summary: "Show a topic",
  usage: "<topic>",
  description: "Shows a topic: its key, name, default subscription and visibility.",
  flags: TOPIC_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof TOPIC_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "topics get <topic>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.topics.get(id);
    if (error) throw apiError("Couldn't read the topic", error);
    printOne(context.out, data, printTopic);
    return 0;
  },
});

const TOPIC_SHARED_FLAGS = {
  name: { type: "string", value: "<name>", description: "Its name in the preference center" },
  description: { type: "string", value: "<text>", description: "What it's about" },
  default: {
    type: "string",
    value: "<subscription>",
    choices: DEFAULTS,
    description:
      "opt_in (reaches every subscribed contact unless they opt out) or opt_out (only those who " +
      "opted in)",
  },
  visibility: {
    type: "string",
    value: "<visibility>",
    choices: VISIBILITIES,
    description: "public, or private to keep it out of the preference center",
  },
  position: { type: "string", value: "<n>", description: "Its order in the preference center" },
  json: { type: "boolean", description: "Print the topic as JSON" },
} as const satisfies Flags;

const topicsCreate: Command = defineCommand({
  name: "topics create",
  summary: "Create a topic",
  usage: "<key> --name <name> --default <opt_in|opt_out> [options]",
  description: "Creates a topic. Emails sent with `category` equal to its key are about it.",
  flags: TOPIC_SHARED_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof TOPIC_SHARED_FLAGS>) => {
    const [key] = requireArgs(
      positionals,
      1,
      "topics create <key> --name <name> --default <…>",
    ) as [string];
    const subscription = oneOf("--default", values.default, DEFAULTS);
    if (!values.name || !subscription) {
      throw new UsageError("A topic needs --name and --default (opt_in or opt_out).");
    }
    const visibility = oneOf("--visibility", values.visibility, VISIBILITIES);
    const position = integerOf("--position", values.position);
    const params: CreateTopicParams = {
      key,
      name: values.name,
      default_subscription: subscription,
      ...(values.description !== undefined && { description: values.description }),
      ...(visibility && { visibility }),
      ...(position !== undefined && { position }),
    };
    const coss = await client(context);
    const { data, error } = await coss.email.topics.create(params);
    if (error) throw apiError("Couldn't create the topic", error);
    printOne(context.out, data, printTopic);
    return 0;
  },
});

const topicsUpdate: Command = defineCommand({
  name: "topics update",
  summary: "Change a topic",
  usage: "<topic> [options]",
  description: "Changes what is given. A topic's key can't change. --description none clears it.",
  flags: TOPIC_SHARED_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof TOPIC_SHARED_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "topics update <topic> [options]") as [string];
    const subscription = oneOf("--default", values.default, DEFAULTS);
    const visibility = oneOf("--visibility", values.visibility, VISIBILITIES);
    const position = integerOf("--position", values.position);
    const params: UpdateTopicParams = {
      ...(values.name !== undefined && { name: values.name }),
      ...(values.description !== undefined && { description: orNull(values.description, "none") }),
      ...(subscription && { default_subscription: subscription }),
      ...(visibility && { visibility }),
      ...(position !== undefined && { position }),
    };
    if (Object.keys(params).length === 0) {
      throw new UsageError("Pass at least one thing to change (coss topics update --help).");
    }
    const coss = await client(context);
    const { data, error } = await coss.email.topics.update(id, params);
    if (error) throw apiError("Couldn't change the topic", error);
    printOne(context.out, data, printTopic);
    return 0;
  },
});

const topicsRemove: Command = defineCommand({
  name: "topics remove",
  summary: "Delete a topic",
  usage: "<topic>",
  description: "Deletes a topic, with contacts' choices about it.",
  flags: REMOVE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof REMOVE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "topics remove <topic>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.email.topics.remove(id);
    if (error) throw apiError("Couldn't delete the topic", error);
    printDeleted(context.out, data);
    return 0;
  },
});

// ── Marketing settings ──────────────────────────────────────────────────────────────────────────

function printSettings(out: Output, settings: MarketingSettings): void {
  const own = (value: string | null, fallback: string) => (value ? printable(value) : fallback);
  out.line(`Display name      ${own(settings.display_name, "not set")}`);
  out.line(`Mailing address   ${own(settings.mailing_address, "not set")}`);
  out.line(`Double opt-in     ${settings.double_opt_in_default ? "by default" : "when asked"}`);
  out.line(`Confirmation from ${own(settings.confirmation_from, "not set")}`);
  out.line(`Confirmed page    ${own(settings.confirmed_redirect_url, "coss.com's")}`);
  const custom = settings.confirmation_subject ?? settings.confirmation_html;
  out.line(`Confirmation mail ${custom ? "your own" : "coss.com's"}`);
}

const SETTINGS_FLAGS = {
  json: { type: "boolean", description: "Print the settings as JSON" },
} as const satisfies Flags;

const settingsGet: Command = defineCommand({
  name: "marketing settings get",
  summary: "Show the environment's marketing settings",
  description:
    "Shows the sender's name and postal address marketing email carries, and how double opt-in " +
    "confirms.",
  flags: SETTINGS_FLAGS,
  run: async ({ context }: CommandInput<typeof SETTINGS_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.email.marketingSettings.get();
    if (error) throw apiError("Couldn't read the settings", error);
    printOne(context.out, data, printSettings);
    return 0;
  },
});

const SETTINGS_SET_FLAGS = {
  "display-name": {
    type: "string",
    value: "<name>",
    description: "The sender's name in the preference center",
  },
  "mailing-address": {
    type: "string",
    value: "<address>",
    description: "The postal address every marketing email carries",
  },
  "double-opt-in": { type: "boolean", description: "New contacts confirm first, by default" },
  "no-double-opt-in": { type: "boolean", description: "New contacts confirm only when asked" },
  "confirmation-from": {
    type: "string",
    value: "<address>",
    description: "The sender of confirmation emails",
  },
  "confirmation-subject": {
    type: "string",
    value: "<subject>",
    description: "Their subject",
  },
  "confirmation-html": {
    type: "string",
    value: "<file>",
    description: "A file with their HTML, containing {{{confirmation_url}}}",
  },
  "confirmation-text": {
    type: "string",
    value: "<file>",
    description: "A file with their text, containing {{{confirmation_url}}}",
  },
  "confirmed-redirect-url": {
    type: "string",
    value: "<url>",
    description: "Where confirming sends the contact (https)",
  },
  json: { type: "boolean", description: "Print the settings as JSON" },
} as const satisfies Flags;

/** A settings file: the word `default` instead of a path goes back to coss.com's. */
async function fileOrDefault(
  context: Context,
  flag: string,
  value: string,
): Promise<string | null> {
  return value === "default" ? null : fileText(context, flag, value);
}

const settingsSet: Command = defineCommand({
  name: "marketing settings set",
  summary: "Change the environment's marketing settings",
  description:
    "Changes the settings given; the word default clears one, going back to coss.com's value.",
  flags: SETTINGS_SET_FLAGS,
  run: async ({ values, context }: CommandInput<typeof SETTINGS_SET_FLAGS>) => {
    const doubleOptIn = eitherOf(values["double-opt-in"], values["no-double-opt-in"], [
      "--double-opt-in",
      "--no-double-opt-in",
    ]);
    const html = values["confirmation-html"];
    const text = values["confirmation-text"];
    const params: UpdateMarketingSettingsParams = {
      ...(values["display-name"] !== undefined && {
        display_name: orNull(values["display-name"]),
      }),
      ...(values["mailing-address"] !== undefined && {
        mailing_address: orNull(values["mailing-address"]),
      }),
      ...(doubleOptIn !== undefined && { double_opt_in_default: doubleOptIn }),
      ...(values["confirmation-from"] !== undefined && {
        confirmation_from: orNull(values["confirmation-from"]),
      }),
      ...(values["confirmation-subject"] !== undefined && {
        confirmation_subject: orNull(values["confirmation-subject"]),
      }),
      ...(html !== undefined && {
        confirmation_html: await fileOrDefault(context, "--confirmation-html", html),
      }),
      ...(text !== undefined && {
        confirmation_text: await fileOrDefault(context, "--confirmation-text", text),
      }),
      ...(values["confirmed-redirect-url"] !== undefined && {
        confirmed_redirect_url: orNull(values["confirmed-redirect-url"]),
      }),
    };
    if (Object.keys(params).length === 0) {
      throw new UsageError(
        "Pass at least one setting to change (coss marketing settings set --help).",
      );
    }
    const coss = await client(context);
    const { data, error } = await coss.email.marketingSettings.update(params);
    if (error) throw apiError("Couldn't change the settings", error);
    printOne(context.out, data, printSettings);
    return 0;
  },
});

export const MARKETING_LISTS_COMMANDS: readonly Command[] = [
  audiencesList,
  audiencesGet,
  audiencesCreate,
  audiencesUpdate,
  audiencesRemove,
  audienceContactsList,
  audienceContactsAdd,
  audienceContactsRemove,
  segmentsList,
  segmentsGet,
  segmentsCreate,
  segmentsUpdate,
  segmentsRemove,
  segmentContactsList,
  topicsList,
  topicsGet,
  topicsCreate,
  topicsUpdate,
  topicsRemove,
  settingsGet,
  settingsSet,
];
