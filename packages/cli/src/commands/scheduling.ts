/** `coss scheduling …`: the environment's hosts and bookings, on the public API. */
import type { Coss, SchedulingBooking, SchedulingBookingStatus } from "coss";
import { type Flags, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { type Context, clientFor, resolveCredentials } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import { table } from "../table.ts";

const STATUSES: readonly SchedulingBookingStatus[] = [
  "held",
  "pending_approval",
  "confirmed",
  "cancelled",
  "declined",
];

const LIMIT = {
  type: "string",
  value: "<n>",
  description: "How many to show, 1-100 (default 20)",
} as const;

async function client(context: Context): Promise<Coss> {
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

const when = (iso: string): string => iso.slice(0, 16).replace("T", " ");

const HOSTS_FLAGS = {
  limit: LIMIT,
  json: { type: "boolean", description: "One host per line, as JSON" },
} as const satisfies Flags;

const hosts: Command = defineCommand({
  name: "scheduling hosts",
  summary: "List the people who can be booked",
  description: "Lists the environment's scheduling hosts, newest first.",
  flags: HOSTS_FLAGS,
  run: async ({ values, context }: CommandInput<typeof HOSTS_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.scheduling.hosts.list({
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the hosts", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("No hosts.");
      return 0;
    }
    const lines = table([
      ["ID", "UID", "NAME", "TIME ZONE", "STATUS"],
      ...data.data.map((item) => [
        item.id,
        printable(item.uid ?? ""),
        printable(item.name),
        item.time_zone,
        item.status === "active" ? item.status : out.style("yellow", item.status),
      ]),
    ]);
    out.line(out.style("dim", lines[0] ?? ""));
    for (const line of lines.slice(1)) out.line(line);
    return 0;
  },
});

const BOOKINGS_FLAGS = {
  host: { type: "string", value: "<host>", description: "Only this host (id or uid)" },
  status: {
    type: "string",
    value: "<status>",
    choices: STATUSES,
    description: "Only this status: held, pending_approval, confirmed, cancelled or declined",
  },
  limit: LIMIT,
  json: { type: "boolean", description: "One booking per line, as JSON" },
} as const satisfies Flags;

const bookings: Command = defineCommand({
  name: "scheduling bookings",
  summary: "List bookings",
  description: "Lists the environment's bookings, newest first.",
  flags: BOOKINGS_FLAGS,
  run: async ({ values, context }: CommandInput<typeof BOOKINGS_FLAGS>) => {
    const status = values.status;
    if (status !== undefined && !(STATUSES as readonly string[]).includes(status)) {
      throw new UsageError(`--status takes ${STATUSES.join(", ")}; got "${status}".`);
    }
    const coss = await client(context);
    const { data, error } = await coss.scheduling.bookings.list({
      ...(values.host !== undefined && { host: values.host }),
      ...(status !== undefined && { status: status as SchedulingBookingStatus }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the bookings", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("No bookings.");
      return 0;
    }
    const lines = table([
      ["ID", "START", "TITLE", "STATUS"],
      ...data.data.map((item) => [
        item.id,
        when(item.start),
        printable(item.title),
        item.status === "confirmed"
          ? out.style("green", item.status)
          : out.style("yellow", item.status),
      ]),
    ]);
    out.line(out.style("dim", lines[0] ?? ""));
    for (const line of lines.slice(1)) out.line(line);
    return 0;
  },
});

const TYPES_FLAGS = {
  limit: LIMIT,
  json: { type: "boolean", description: "One event type per line, as JSON" },
} as const satisfies Flags;

const eventTypes: Command = defineCommand({
  name: "scheduling event-types",
  summary: "List what can be booked",
  description: "Lists the environment's event types, with their length and hosts.",
  flags: TYPES_FLAGS,
  run: async ({ values, context }: CommandInput<typeof TYPES_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.scheduling.eventTypes.list({
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the event types", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("No event types.");
      return 0;
    }
    const lines = table([
      ["ID", "UID", "TITLE", "KIND", "MINUTES", "HOSTS"],
      ...data.data.map((item) => [
        item.id,
        printable(item.uid ?? ""),
        printable(item.title),
        item.kind,
        String(item.duration_minutes),
        String(item.hosts.length),
      ]),
    ]);
    out.line(out.style("dim", lines[0] ?? ""));
    for (const line of lines.slice(1)) out.line(line);
    return 0;
  },
});

const SLOTS_FLAGS = {
  start: { type: "string", value: "<time>", description: "From this ISO 8601 instant" },
  end: { type: "string", value: "<time>", description: "Until this one (at most 62 days later)" },
  host: { type: "string", value: "<host>", description: "Only this host (id or uid)" },
  json: { type: "boolean", description: "One slot per line, as JSON" },
} as const satisfies Flags;

const slots: Command = defineCommand({
  name: "scheduling slots",
  summary: "List starts an event type can be booked at",
  usage: "<event-type> --start <time> --end <time>",
  description:
    "Lists the bookable starts between two instants. A host whose calendar can't be read isn't offered: check `coss scheduling calendars <host>` if there are none.",
  flags: SLOTS_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof SLOTS_FLAGS>) => {
    const [eventType] = requireArgs(positionals, 1, "scheduling slots <event-type>") as [string];
    if (!values.start || !values.end) throw new UsageError("Pass --start and --end.");
    const coss = await client(context);
    const { data, error } = await coss.scheduling.slots.list(eventType, {
      start: values.start,
      end: values.end,
      ...(values.host !== undefined && { host: values.host }),
    });
    if (error) throw apiError("Couldn't list the slots", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("No slots in that time.");
      return 0;
    }
    for (const item of data.data) out.line(`${when(item.start)}  ${item.hosts.join(", ")}`);
    return 0;
  },
});

const BOOKING_FLAGS = {
  json: { type: "boolean", description: "Print the booking as JSON" },
} as const satisfies Flags;

function printBooking(context: Context, booking: SchedulingBooking): void {
  const { out } = context;
  if (out.json) {
    out.data(booking);
    return;
  }
  out.line(`${booking.id} ${booking.status} ${printable(booking.title)}`);
  out.line(`  ${when(booking.start)} to ${when(booking.end)}`);
  out.line(`  Hosts  ${booking.hosts.join(", ")}`);
  // Attendees type their own names: never escape sequences.
  for (const attendee of booking.attendees) {
    out.line(`  ${printable(attendee.name ?? attendee.uid ?? attendee.id)}`);
  }
}

const booking: Command = defineCommand({
  name: "scheduling booking",
  summary: "Show a booking and its attendees",
  usage: "<booking>",
  description: "Shows a booking: when, with whom and its status.",
  flags: BOOKING_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof BOOKING_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling booking <booking>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.bookings.get(id);
    if (error) throw apiError("Couldn't read the booking", error);
    printBooking(context, data);
    return 0;
  },
});

const cancel: Command = defineCommand({
  name: "scheduling cancel",
  summary: "Cancel a booking and tell the attendee",
  usage: "<booking>",
  description:
    "Frees the time, removes the calendar event and tells the attendee. It can't be undone.",
  flags: BOOKING_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof BOOKING_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling cancel <booking>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.bookings.cancel(id);
    if (error) throw apiError("Couldn't cancel the booking", error);
    printBooking(context, data);
    return 0;
  },
});

const noShow: Command = defineCommand({
  name: "scheduling no-show",
  summary: "Mark a booking as a no-show",
  usage: "<booking>",
  description:
    "Records that the attendee didn't come, once the booking has started. Webhooks fire and any reminder timed from it is sent. It can't be undone.",
  flags: BOOKING_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof BOOKING_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling no-show <booking>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.bookings.markNoShow(id);
    if (error) throw apiError("Couldn't mark the booking", error);
    printBooking(context, data);
    return 0;
  },
});

const NOTIFICATIONS_FLAGS = {
  json: { type: "boolean", description: "One notification per line, as JSON" },
} as const satisfies Flags;

const notifications: Command = defineCommand({
  name: "scheduling notifications",
  summary: "List what was queued for a booking",
  usage: "<booking>",
  description:
    "What's been queued for a booking and what became of it, including why a reminder wasn't sent.",
  flags: NOTIFICATIONS_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof NOTIFICATIONS_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling notifications <booking>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.bookings.notifications(id);
    if (error) throw apiError("Couldn't list the notifications", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("Nothing queued.");
      return 0;
    }
    const lines = table([
      ["DUE", "WHAT", "CHANNEL", "TO", "OUTCOME"],
      ...data.data.map((item) => [
        when(item.due_at),
        printable(item.reminder_key ?? item.kind),
        item.channel,
        item.recipient,
        item.outcome ?? "scheduled",
      ]),
    ]);
    out.line(out.style("dim", lines[0] ?? ""));
    for (const line of lines.slice(1)) out.line(line);
    return 0;
  },
});

const REMINDERS_FLAGS = {
  "event-type": {
    type: "string",
    value: "<event-type>",
    description: "This event type's own list",
  },
  json: { type: "boolean", description: "One reminder per line, as JSON" },
} as const satisfies Flags;

const reminders: Command = defineCommand({
  name: "scheduling reminders",
  summary: "List what goes out around a booking",
  description:
    "Lists the environment's reminders, or an event type's own. Nothing listed means the default: a reminder a day before, or for an event type, the environment's list.",
  flags: REMINDERS_FLAGS,
  run: async ({ values, context }: CommandInput<typeof REMINDERS_FLAGS>) => {
    const coss = await client(context);
    const eventType = values["event-type"];
    const result = eventType
      ? await coss.scheduling.eventTypes.get(eventType)
      : await coss.scheduling.settings.get();
    if (result.error) throw apiError("Couldn't read the reminders", result.error);
    const list = result.data.reminders ?? [];
    const { out } = context;
    if (out.json) {
      for (const item of list) out.data(item);
      return 0;
    }
    if (list.length === 0) {
      out.info(
        result.data.reminders === null
          ? eventType
            ? "This event type uses the environment's list."
            : "The default: a reminder a day before."
          : "No reminders.",
      );
      return 0;
    }
    const lines = table([
      ["KEY", "ANCHOR", "BEFORE", "AFTER", "SEND"],
      ...list.map((item) => [
        printable(item.key),
        item.anchor,
        item.before_minutes === null ? "" : `${item.before_minutes}m`,
        item.after_minutes === null ? "" : `${item.after_minutes}m`,
        [...item.send, ...item.email_to.map((address) => printable(address))].join(", "),
      ]),
    ]);
    out.line(out.style("dim", lines[0] ?? ""));
    for (const line of lines.slice(1)) out.line(line);
    return 0;
  },
});

const CALENDARS_FLAGS = {
  json: { type: "boolean", description: "One connection per line, as JSON" },
} as const satisfies Flags;

const calendars: Command = defineCommand({
  name: "scheduling calendars",
  summary: "List a host's calendar connections",
  usage: "<host>",
  description:
    "Lists a host's calendar connections. `needs_reauth` means coss.com can't read that calendar, so the host isn't offered.",
  flags: CALENDARS_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof CALENDARS_FLAGS>) => {
    const [host] = requireArgs(positionals, 1, "scheduling calendars <host>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.calendars.list(host);
    if (error) throw apiError("Couldn't list the calendars", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("No calendars connected.");
      return 0;
    }
    const lines = table([
      ["ID", "PROVIDER", "ACCOUNT", "STATUS", "CALENDARS"],
      ...data.data.map((item) => [
        item.id,
        item.provider,
        printable(item.account),
        item.status === "active" ? item.status : out.style("yellow", item.status),
        String(item.calendars.length),
      ]),
    ]);
    out.line(out.style("dim", lines[0] ?? ""));
    for (const line of lines.slice(1)) out.line(line);
    return 0;
  },
});

export const SCHEDULING_COMMANDS: readonly Command[] = [
  hosts,
  eventTypes,
  slots,
  bookings,
  booking,
  cancel,
  calendars,
  noShow,
  notifications,
  reminders,
];
