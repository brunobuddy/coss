/** `coss scheduling …`: the environment's hosts and bookings, on the public API. */
import type {
  Coss,
  SchedulingBooking,
  SchedulingBookingStatus,
  SchedulingReassignmentCounts,
  SchedulingReassignmentOverride,
  SchedulingReassignmentReason,
} from "coss";
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

const REASSIGN_REASONS: readonly SchedulingReassignmentReason[] = [
  "host_unavailable",
  "out_of_office",
  "workload",
  "customer_request",
  "offboarding",
  "other",
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

const REASSIGN_FLAGS = {
  to: { type: "string", value: "<host>", description: "The new host's id or uid" },
  auto: { type: "boolean", description: "Let coss.com pick the fairest who's free" },
  from: { type: "string", value: "<host>", description: "Who's leaving, if it has several hosts" },
  reason: {
    type: "string",
    value: "<code>",
    description: `Why: ${REASSIGN_REASONS.join(", ")} (default other)`,
  },
  note: { type: "string", value: "<text>", description: "Why, in your words" },
  "any-host": { type: "boolean", description: "Allow a host who doesn't take this event type" },
  override: {
    type: "string",
    value: "<reason>",
    description: "Go past this reason they can't, such as outside_availability. Needs --note",
  },
  "no-notify": { type: "boolean", description: "Don't tell the attendee" },
  json: BOOKING_FLAGS.json,
} as const satisfies Flags;

const reassign: Command = defineCommand({
  name: "scheduling reassign",
  summary: "Give a booking to another host",
  usage: "<booking> (--to <host> | --auto)",
  description:
    "Keeps the booking's id and time. Whoever's leaving and joining are told, and the attendee unless --no-notify. A group session moves as a whole.",
  flags: REASSIGN_FLAGS,
  positionals: true,
  run: async ({ positionals, values, context }: CommandInput<typeof REASSIGN_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling reassign <booking>") as [string];
    if (Boolean(values.to) === Boolean(values.auto)) {
      throw new UsageError("Pass one of --to <host> and --auto.");
    }
    const reason = (values.reason ?? "other") as SchedulingReassignmentReason;
    if (!REASSIGN_REASONS.includes(reason)) {
      throw new UsageError(`--reason takes one of ${REASSIGN_REASONS.join(", ")}.`);
    }
    const overrides = [
      ...(values["any-host"] ? ["any_host"] : []),
      ...(values.override ? [values.override] : []),
    ] as SchedulingReassignmentOverride[];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.bookings.reassign(id, {
      changes: [
        {
          ...(values.to ? { to_host: values.to } : { auto: true }),
          ...(values.from ? { from_host: values.from } : {}),
        },
      ],
      reason_code: reason,
      ...(values.note ? { note: values.note } : {}),
      ...(overrides.length > 0 ? { overrides } : {}),
      ...(values["no-notify"] ? { notify: { attendee: false } } : {}),
    });
    if (error) throw apiError("Couldn't reassign the booking", error);
    printBooking(context, data);
    return 0;
  },
});

const CANDIDATES_FLAGS = {
  json: { type: "boolean", description: "One candidate per line, as JSON" },
} as const satisfies Flags;

const candidates: Command = defineCommand({
  name: "scheduling candidates",
  summary: "List who a booking could go to",
  usage: "<booking>",
  description: "Members of the event type first, each saying whether they're free and why not.",
  flags: CANDIDATES_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof CANDIDATES_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling candidates <booking>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.bookings.reassignCandidates(id);
    if (error) throw apiError("Couldn't list the candidates", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("Nobody else in this environment.");
      return 0;
    }
    const lines = table([
      ["HOST", "NAME", "FREE", "WHY NOT", "MEMBER"],
      ...data.data.map((row) => [
        row.uid ? printable(row.uid) : row.host,
        printable(row.name),
        row.available ? "yes" : "no",
        row.reason ?? "",
        row.member ? "yes" : "no",
      ]),
    ]);
    for (const line of lines) out.line(line);
    return 0;
  },
});

const MANY_FLAGS = {
  from: { type: "string", value: "<host>", description: "Whose bookings, by id or uid" },
  ooo: { type: "string", value: "<id>", description: "The bookings in this out of office entry" },
  to: { type: "string", value: "<host>", description: "Give them all to this host" },
  preferred: {
    type: "string",
    value: "<hosts>",
    description: "Try these first, comma-separated",
  },
  "leave-rest": {
    type: "boolean",
    description: "After --preferred, keep the rest where they are",
  },
  after: { type: "string", value: "<time>", description: "Only bookings ending after this" },
  before: { type: "string", value: "<time>", description: "Only bookings starting before this" },
  reason: REASSIGN_FLAGS.reason,
  note: REASSIGN_FLAGS.note,
  "no-notify": { type: "boolean", description: "Don't tell attendees" },
  "dry-run": { type: "boolean", description: "Show who they'd go to, and move nothing" },
  json: { type: "boolean", description: "One item per line, as JSON" },
} as const satisfies Flags;

const reassignMany: Command = defineCommand({
  name: "scheduling reassign-many",
  summary: "Move many bookings to other hosts",
  usage: "(--from <host> | --ooo <id>)",
  description:
    "Moves them in the background. Each host hears once, and attendees per booking unless --no-notify. A booking nobody can take stays where it is. Start with --dry-run to see who they'd go to.",
  flags: MANY_FLAGS,
  run: async ({ values, context }: CommandInput<typeof MANY_FLAGS>) => {
    if (Boolean(values.from) === Boolean(values.ooo)) {
      throw new UsageError("Pass one of --from <host> and --ooo <id>.");
    }
    if (values.to && values.preferred) {
      throw new UsageError("Pass one of --to and --preferred.");
    }
    const reason = (values.reason ?? "other") as SchedulingReassignmentReason;
    if (!REASSIGN_REASONS.includes(reason)) {
      throw new UsageError(`--reason takes one of ${REASSIGN_REASONS.join(", ")}.`);
    }
    const selection = {
      ...(values.from ? { host: values.from } : {}),
      ...(values.ooo ? { out_of_office: values.ooo } : {}),
      ...(values.after ? { start_after: values.after } : {}),
      ...(values.before ? { start_before: values.before } : {}),
    };
    const strategy = {
      ...(values.to ? { to_host: values.to } : {}),
      ...(values.preferred ? { preferred_hosts: values.preferred.split(",") } : {}),
      ...(values["leave-rest"] ? { otherwise: "leave" as const } : {}),
    };
    const coss = await client(context);
    const { out } = context;
    if (values["dry-run"]) {
      const { data, error } = await coss.scheduling.reassignments.preview({ selection, strategy });
      if (error) throw apiError("Couldn't preview that", error);
      if (out.json) {
        for (const item of data.items) out.data(item);
        return 0;
      }
      if (data.items.length === 0) {
        out.info("Nothing to move.");
        return 0;
      }
      const lines = table([
        ["BOOKING", "START", "FROM", "TO", "WHY NOT"],
        ...data.items.map((item) => [
          item.booking,
          when(item.start),
          item.from_host ?? "",
          item.to_host ?? "stays",
          item.reason ?? "",
        ]),
      ]);
      for (const line of lines) out.line(line);
      if (data.truncated) out.info("That's the first 500.");
      return 0;
    }
    const { data, error } = await coss.scheduling.reassignments.create({
      selection,
      strategy,
      reason_code: reason,
      ...(values.note ? { note: values.note } : {}),
      ...(values["no-notify"] ? { notify: { attendees: false } } : {}),
    });
    if (error) throw apiError("Couldn't start that", error);
    if (out.json) {
      out.data(data);
      return 0;
    }
    out.line(data.id);
    out.info(`Follow it with: coss scheduling reassignment ${data.id}`);
    return 0;
  },
});

const REASSIGNMENTS_FLAGS = {
  limit: LIMIT,
  json: { type: "boolean", description: "One run per line, as JSON" },
} as const satisfies Flags;

const countsLine = (counts: SchedulingReassignmentCounts) =>
  `${counts.reassigned} of ${counts.total} moved, ${counts.no_candidate} stayed, ${counts.skipped} skipped, ${counts.failed} failed`;

const reassignments: Command = defineCommand({
  name: "scheduling reassignments",
  summary: "List bulk reassignments",
  description: "The environment's runs, newest first, with how each went.",
  flags: REASSIGNMENTS_FLAGS,
  run: async ({ values, context }: CommandInput<typeof REASSIGNMENTS_FLAGS>) => {
    const coss = await client(context);
    const limit = limitOf(values.limit);
    const { data, error } = await coss.scheduling.reassignments.list(limit ? { limit } : {});
    if (error) throw apiError("Couldn't list reassignments", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("No reassignments yet.");
      return 0;
    }
    const lines = table([
      ["ID", "STATUS", "CREATED", "PROGRESS"],
      ...data.data.map((row) => [row.id, row.status, when(row.created_at), countsLine(row.counts)]),
    ]);
    for (const line of lines) out.line(line);
    return 0;
  },
});

const REASSIGNMENT_FLAGS = {
  cancel: { type: "boolean", description: "Stop what hasn't happened yet" },
  undo: { type: "boolean", description: "Give back what it moved, as a new run" },
  json: { type: "boolean", description: "As JSON" },
} as const satisfies Flags;

const reassignment: Command = defineCommand({
  name: "scheduling reassignment",
  summary: "Show, cancel or undo a bulk reassignment",
  usage: "<id> [--cancel | --undo]",
  description: "How a run went, and what happened to each booking that didn't move.",
  flags: REASSIGNMENT_FLAGS,
  positionals: true,
  run: async ({ positionals, values, context }: CommandInput<typeof REASSIGNMENT_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling reassignment <id>") as [string];
    if (values.cancel && values.undo) throw new UsageError("Pass one of --cancel and --undo.");
    const coss = await client(context);
    const { out } = context;
    const { data, error } = values.cancel
      ? await coss.scheduling.reassignments.cancel(id)
      : values.undo
        ? await coss.scheduling.reassignments.undo(id)
        : await coss.scheduling.reassignments.get(id);
    if (error) throw apiError("Couldn't do that", error);
    if (out.json) {
      out.data(data);
      return 0;
    }
    out.line(`${data.id}  ${data.status}`);
    out.line(countsLine(data.counts));
    if (values.undo) return 0;
    const items = await coss.scheduling.reassignments.items(id, { limit: 100 });
    if (items.error) throw apiError("Couldn't list what happened", items.error);
    const unmoved = items.data.data.filter((item) => item.outcome !== "reassigned");
    if (unmoved.length === 0) return 0;
    const lines = table([
      ["BOOKING", "OUTCOME", "CODE"],
      ...unmoved.map((item) => [item.booking, item.outcome, item.error_code ?? ""]),
    ]);
    for (const line of lines) out.line(line);
    return 0;
  },
});

const OOO_FLAGS = {
  host: { type: "string", value: "<host>", description: "One host's entries, by id or uid" },
  limit: LIMIT,
  json: { type: "boolean", description: "One entry per line, as JSON" },
} as const satisfies Flags;

const outOfOffice: Command = defineCommand({
  name: "scheduling ooo",
  summary: "List time hosts are away",
  description: "The environment's out of office entries, newest first.",
  flags: OOO_FLAGS,
  run: async ({ values, context }: CommandInput<typeof OOO_FLAGS>) => {
    const coss = await client(context);
    const limit = limitOf(values.limit);
    const { data, error } = await coss.scheduling.outOfOffice.list({
      ...(limit ? { limit } : {}),
      ...(values.host ? { host: values.host } : {}),
    });
    if (error) throw apiError("Couldn't list out of office entries", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("Nobody's away.");
      return 0;
    }
    const lines = table([
      ["ID", "HOST", "START", "END", "REASON"],
      ...data.data.map((row) => [
        row.id,
        row.host,
        when(row.start),
        when(row.end),
        printable(row.reason),
      ]),
    ]);
    for (const line of lines) out.line(line);
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
  reassign,
  candidates,
  reassignMany,
  reassignments,
  reassignment,
  outOfOffice,
  calendars,
];
