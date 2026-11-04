/** `coss scheduling …`: the environment's hosts and bookings, on the public API. */
import type {
  Coss,
  CreateSchedulingBookingParams,
  CreateSchedulingEventTypeParams,
  CreateSchedulingHostParams,
  SchedulingAttributes,
  SchedulingBooking,
  SchedulingBookingStatus,
  SchedulingEventType,
  SchedulingEventTypeKind,
  SchedulingHost,
  SchedulingReassignmentCounts,
  SchedulingReassignmentOverride,
  SchedulingReassignmentReason,
  SchedulingSchedule,
  SchedulingWeeklyRule,
  UpdateSchedulingEventTypeParams,
  UpdateSchedulingHostParams,
  UpsertSchedulingScheduleParams,
} from "coss";
import { type Flags, pairs, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { type Context, clientFor, resolveCredentials } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import { jsonObject } from "../fields.ts";
import type { Output } from "../output.ts";
import { table } from "../table.ts";
import {
  confirmLive,
  eitherOf,
  integerOf,
  oneOf,
  orNull,
  pairsOf,
  printDeleted,
  printList,
  printOne,
} from "./list-output.ts";

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
  description:
    "Lists the environment's scheduling hosts, newest first. `coss scheduling hosts " +
    "create|update|remove` manage them.",
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
  description:
    "Lists the environment's event types, with their length and hosts. `coss scheduling " +
    "event-types create|update` manage them.",
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

const EXPLAIN_FLAGS = {
  start: { type: "string", value: "<time>", description: "The ISO 8601 instant to explain" },
  host: { type: "string", value: "<host>", description: "Only this host (id or uid)" },
  json: { type: "boolean", description: "Print the explanation as JSON" },
} as const satisfies Flags;

const explain: Command = defineCommand({
  name: "scheduling slots explain",
  summary: "Explain why one start can or can't be booked",
  usage: "<event-type> --start <time>",
  description:
    "Says whether one start can be booked right now and, host by host, why not, decided the same way a booking is.",
  flags: EXPLAIN_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof EXPLAIN_FLAGS>) => {
    const [eventType] = requireArgs(positionals, 1, "scheduling slots explain <event-type>") as [
      string,
    ];
    if (!values.start) throw new UsageError("Pass --start.");
    const coss = await client(context);
    const { data, error } = await coss.scheduling.slots.explain(eventType, {
      start: values.start,
      ...(values.host !== undefined && { host: values.host }),
    });
    if (error) throw apiError("Couldn't explain the slot", error);
    const { out } = context;
    if (out.json) {
      out.data(data);
      return 0;
    }
    out.line(
      `${when(data.start)}  ${data.available ? "available" : (data.reason ?? "unavailable")}`,
    );
    for (const host of data.hosts) {
      const why = host.calendar_reason ?? host.reason ?? "free";
      out.line(`  ${host.host}  ${host.role}  ${why}`);
    }
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

const CANCEL_FLAGS = {
  ...BOOKING_FLAGS,
  reason: { type: "string", value: "<text>", description: "Why it's being cancelled" },
} as const satisfies Flags;

const EVENTS_FLAGS = {
  json: { type: "boolean", description: "One event per line, as JSON" },
} as const satisfies Flags;

const bookingEvents: Command = defineCommand({
  name: "scheduling booking-events",
  summary: "Show what's happened to a booking",
  usage: "<booking>",
  description: "Lists a booking's history, oldest first, and who did each thing.",
  flags: EVENTS_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof EVENTS_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling booking-events <booking>") as [string];
    const coss = await client(context);
    const { out } = context;
    let after: string | undefined;
    do {
      const { data, error } = await coss.scheduling.bookings.events(id, {
        limit: 100,
        ...(after ? { after } : {}),
      });
      if (error) throw apiError("Couldn't list the booking's history", error);
      for (const event of data.data) {
        if (out.json) out.data(event);
        else out.line(`${when(event.occurred_at)}  ${event.type}  ${event.actor.kind}`);
      }
      after = data.has_more ? data.data.at(-1)?.id : undefined;
    } while (after);
    return 0;
  },
});

const cancel: Command = defineCommand({
  name: "scheduling cancel",
  summary: "Cancel a booking and tell the attendee",
  usage: "<booking> [--reason <text>]",
  description:
    "Frees the time, removes the calendar event and tells the attendee. It can't be undone.",
  flags: CANCEL_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof CANCEL_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling cancel <booking>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.bookings.cancel(
      id,
      values.reason ? { reason: values.reason } : {},
    );
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

/** `--data`: the rest of a request body, which the flags win over. */
const DATA_FLAG = {
  type: "string",
  value: "<json>",
  description: "More of the request body, as JSON: inline, @file or - for stdin; flags win over it",
} as const;

const REMOVE_FLAGS = {
  json: { type: "boolean", description: "Print the result as JSON" },
} as const satisfies Flags;

/** A repeatable `name=value` flag where a name given twice makes a list: `licensed_in=CA`. */
function multiPairs(
  values: string[] | undefined,
  flag: string,
): Record<string, string | string[]> | undefined {
  if (!values) return undefined;
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of pairs(values, flag)) {
    const current = out[name];
    if (current === undefined) out[name] = value;
    else out[name] = [...(Array.isArray(current) ? current : [current]), value];
  }
  return out;
}

// ── Hosts ───────────────────────────────────────────────────────────────────────────────────────

function printHost(out: Output, host: SchedulingHost): void {
  out.line(
    `${host.id} ${printable(host.name)}${host.status === "active" ? "" : out.style("yellow", ` (${host.status})`)}`,
  );
  if (host.uid) out.line(`  Uid        ${printable(host.uid)}`);
  if (host.email) out.line(`  Email      ${printable(host.email)}`);
  out.line(`  Time zone  ${host.time_zone}`);
  for (const [name, value] of Object.entries(host.attributes)) {
    out.line(`  ${printable(name)}: ${printable(Array.isArray(value) ? value.join(", ") : value)}`);
  }
}

const HOST_FIELD_FLAGS = {
  uid: { type: "string", value: "<uid>", description: "Your own id for this host" },
  email: { type: "string", value: "<address>", description: "Where its notifications go" },
  attribute: {
    type: "string",
    multiple: true,
    value: "<name=value>",
    description: "What pools filter hosts by: licensed_in=CA (repeat a name for a list)",
  },
  metadata: {
    type: "string",
    multiple: true,
    value: "<name=value>",
    description: "Metadata (repeatable)",
  },
} as const satisfies Flags;

const HOSTS_CREATE_FLAGS = {
  "time-zone": { type: "string", value: "<zone>", description: "Its IANA time zone: Europe/Paris" },
  ...HOST_FIELD_FLAGS,
  data: DATA_FLAG,
  json: { type: "boolean", description: "Print the host as JSON" },
} as const satisfies Flags;

const hostsCreate: Command = defineCommand({
  name: "scheduling hosts create",
  summary: "Create a host: someone who can be booked",
  usage: "<name> --time-zone <zone> [options]",
  description:
    "Creates a host. Give it a schedule next: `coss scheduling schedules create`. Creation is " +
    "never retried, since the API doesn't deduplicate it.",
  flags: HOSTS_CREATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof HOSTS_CREATE_FLAGS>) => {
    const [name] = requireArgs(
      positionals,
      1,
      "scheduling hosts create <name> --time-zone <zone>",
    ) as [string];
    const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
    const zone = values["time-zone"] ?? (base.time_zone as string | undefined);
    if (!zone) throw new UsageError("Pass --time-zone <zone>, e.g. --time-zone Europe/Paris.");
    const attributes = multiPairs(values.attribute, "attribute");
    const metadata = pairsOf(values.metadata, "metadata");
    const params = {
      ...base,
      name,
      time_zone: zone,
      ...(values.uid !== undefined && { uid: values.uid }),
      ...(values.email !== undefined && { email: values.email }),
      ...(attributes && { attributes }),
      ...(metadata && { metadata }),
    } as CreateSchedulingHostParams;
    const coss = await client(context);
    const { data, error } = await coss.scheduling.hosts.create(params);
    if (error) throw apiError("Couldn't create the host", error);
    printOne(context.out, data, printHost);
    return 0;
  },
});

const HOST_STATUSES = ["active", "disabled"] as const;

const HOSTS_UPDATE_FLAGS = {
  name: { type: "string", value: "<name>", description: "Its new name" },
  "time-zone": { type: "string", value: "<zone>", description: "Its IANA time zone" },
  status: {
    type: "string",
    value: "<status>",
    choices: HOST_STATUSES,
    description: "active, or disabled to stop offering it (its bookings stay)",
  },
  ...HOST_FIELD_FLAGS,
  uid: { type: "string", value: "<uid>", description: "Your own id for this host (none: remove)" },
  email: {
    type: "string",
    value: "<address>",
    description: "Where its notifications go (none: remove)",
  },
  data: DATA_FLAG,
  json: { type: "boolean", description: "Print the host as JSON" },
} as const satisfies Flags;

const hostsUpdate: Command = defineCommand({
  name: "scheduling hosts update",
  summary: "Change a host, or disable it",
  usage: "<host> [options]",
  description: "Changes what is given on a host, by id or uid; the rest stays.",
  flags: HOSTS_UPDATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof HOSTS_UPDATE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling hosts update <host> [options]") as [
      string,
    ];
    const status = oneOf("--status", values.status, HOST_STATUSES);
    const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
    const attributes = multiPairs(values.attribute, "attribute");
    const metadata = pairsOf(values.metadata, "metadata");
    const params = {
      ...base,
      ...(values.name !== undefined && { name: values.name }),
      ...(values["time-zone"] !== undefined && { time_zone: values["time-zone"] }),
      ...(status && { status }),
      ...(values.uid !== undefined && { uid: orNull(values.uid, "none") }),
      ...(values.email !== undefined && { email: orNull(values.email, "none") }),
      ...(attributes && { attributes }),
      ...(metadata && { metadata }),
    } as UpdateSchedulingHostParams;
    if (Object.keys(params).length === 0) {
      throw new UsageError(
        "Pass at least one thing to change (coss scheduling hosts update --help).",
      );
    }
    const coss = await client(context);
    const { data, error } = await coss.scheduling.hosts.update(id, params);
    if (error) throw apiError("Couldn't change the host", error);
    printOne(context.out, data, printHost);
    return 0;
  },
});

const hostsRemove: Command = defineCommand({
  name: "scheduling hosts remove",
  summary: "Delete a host",
  usage: "<host>",
  description: "Deletes a host, by id or uid. To stop offering it instead: --status disabled.",
  flags: REMOVE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof REMOVE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling hosts remove <host>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.hosts.remove(id);
    if (error) throw apiError("Couldn't delete the host", error);
    printDeleted(context.out, data);
    return 0;
  },
});

// ── Schedules ───────────────────────────────────────────────────────────────────────────────────

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function dayOf(word: string, rule: string): number {
  const digit = /^[0-6]$/.test(word) ? Number(word) : -1;
  const day = digit >= 0 ? digit : DAY_NAMES.indexOf(word.toLowerCase().slice(0, 3));
  if (day < 0) throw new UsageError(`--rule: "${word}" isn't a day, in "${rule}".`);
  return day;
}

/** `--rule "mon-fri 09:00-17:00"`, `"sat,sun 10:00-12:00"`, `"fri-mon 08:00-24:00"`. */
export function parseRule(text: string): SchedulingWeeklyRule {
  const match = /^\s*(\S+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/.exec(text);
  if (!match) {
    throw new UsageError(
      `--rule takes "<days> <start>-<end>": "mon-fri 09:00-17:00"; got "${text}".`,
    );
  }
  const [, words, start, end] = match as unknown as [string, string, string, string];
  const days = new Set<number>();
  for (const part of words.split(",").filter(Boolean)) {
    const [from, to] = part.split("-") as [string, string | undefined];
    const first = dayOf(from, text);
    const last = to === undefined ? first : dayOf(to, text);
    for (let day = first; ; day = (day + 1) % 7) {
      days.add(day);
      if (day === last) break;
    }
  }
  return { days: [...days].sort((a, b) => a - b), start, end };
}

function printSchedule(out: Output, schedule: SchedulingSchedule): void {
  out.line(
    `${schedule.id} ${printable(schedule.name)}${schedule.is_default ? out.style("dim", " (default)") : ""}`,
  );
  out.line(`  Time zone  ${schedule.time_zone}`);
  for (const rule of schedule.rules) {
    const days = rule.days.map((day) => DAY_NAMES[day] ?? String(day)).join(",");
    out.line(`  ${days} ${rule.start}-${rule.end}`);
  }
  if (schedule.overrides.length > 0) out.line(`  ${schedule.overrides.length} overrides`);
}

const SCHEDULES_LIST_FLAGS = {
  json: { type: "boolean", description: "One schedule per line, as JSON" },
} as const satisfies Flags;

const schedulesList: Command = defineCommand({
  name: "scheduling schedules list",
  summary: "List a host's weekly schedules",
  usage: "<host>",
  description: "Lists a host's schedules, oldest first.",
  flags: SCHEDULES_LIST_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof SCHEDULES_LIST_FLAGS>) => {
    const [host] = requireArgs(positionals, 1, "scheduling schedules list <host>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.schedules.list(host);
    if (error) throw apiError("Couldn't list the schedules", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No schedules: `coss scheduling schedules create` adds one.",
      header: ["ID", "NAME", "TIME ZONE", "DEFAULT", "RULES"],
      row: (item) => [
        item.id,
        printable(item.name),
        item.time_zone,
        item.is_default ? "yes" : "",
        String(item.rules.length),
      ],
    });
    return 0;
  },
});

const SCHEDULE_FLAGS = {
  rule: {
    type: "string",
    multiple: true,
    value: '"<days> <start>-<end>"',
    description: 'When it\'s free, in local time: "mon-fri 09:00-17:00" (repeatable)',
  },
  name: { type: "string", value: "<name>", description: "Its name" },
  "time-zone": { type: "string", value: "<zone>", description: "Default: the host's" },
  default: { type: "boolean", description: "Make it the host's default schedule" },
  data: {
    type: "string",
    value: "<json>",
    description:
      "More of the request body (overrides), as JSON: inline, @file or - for stdin; flags win over it",
  },
  json: { type: "boolean", description: "Print the schedule as JSON" },
} as const satisfies Flags;

type ScheduleValues = CommandInput<typeof SCHEDULE_FLAGS>["values"];

async function scheduleFields(context: Context, values: ScheduleValues) {
  const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
  return {
    ...base,
    ...(values.rule && { rules: values.rule.map(parseRule) }),
    ...(values.name !== undefined && { name: values.name }),
    ...(values["time-zone"] !== undefined && { time_zone: values["time-zone"] }),
    ...(values.default && { is_default: true }),
  } as Partial<UpsertSchedulingScheduleParams>;
}

const schedulesCreate: Command = defineCommand({
  name: "scheduling schedules create",
  summary: "Add a weekly schedule to a host",
  usage: '<host> --rule "mon-fri 09:00-17:00" [options]',
  description:
    "Adds a schedule; a host's first is its default. Creation is never retried, since the API " +
    "doesn't deduplicate it.",
  flags: SCHEDULE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof SCHEDULE_FLAGS>) => {
    const [host] = requireArgs(
      positionals,
      1,
      "scheduling schedules create <host> --rule <rule>",
    ) as [string];
    const fields = await scheduleFields(context, values);
    if (!fields.rules) throw new UsageError('Pass --rule, e.g. --rule "mon-fri 09:00-17:00".');
    const coss = await client(context);
    const { data, error } = await coss.scheduling.schedules.create(
      host,
      fields as UpsertSchedulingScheduleParams,
    );
    if (error) throw apiError("Couldn't create the schedule", error);
    printOne(context.out, data, printSchedule);
    return 0;
  },
});

const schedulesUpdate: Command = defineCommand({
  name: "scheduling schedules update",
  summary: "Change a schedule",
  usage: "<host> <schedule> [options]",
  description:
    "Changes what is given: --rule replaces its rules, and without one they stay as they are. " +
    "Existing bookings stay.",
  flags: SCHEDULE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof SCHEDULE_FLAGS>) => {
    const [host, id] = requireArgs(
      positionals,
      2,
      "scheduling schedules update <host> <schedule> [options]",
    ) as [string, string];
    const fields = await scheduleFields(context, values);
    if (Object.keys(fields).length === 0) {
      throw new UsageError(
        "Pass at least one thing to change (coss scheduling schedules update --help).",
      );
    }
    const coss = await client(context);
    // The API replaces a schedule whole, so a change of name alone resends its rules.
    let rules = fields.rules;
    if (!rules) {
      const current = await coss.scheduling.schedules.get(host, id);
      if (current.error) throw apiError("Couldn't read the schedule", current.error);
      rules = current.data.rules;
    }
    const { data, error } = await coss.scheduling.schedules.update(host, id, { ...fields, rules });
    if (error) throw apiError("Couldn't change the schedule", error);
    printOne(context.out, data, printSchedule);
    return 0;
  },
});

const schedulesRemove: Command = defineCommand({
  name: "scheduling schedules remove",
  summary: "Delete a schedule (not the host's default)",
  usage: "<host> <schedule>",
  description: "Deletes a schedule. The API refuses to delete the host's default.",
  flags: REMOVE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof REMOVE_FLAGS>) => {
    const [host, id] = requireArgs(
      positionals,
      2,
      "scheduling schedules remove <host> <schedule>",
    ) as [string, string];
    const coss = await client(context);
    const { data, error } = await coss.scheduling.schedules.remove(host, id);
    if (error) throw apiError("Couldn't delete the schedule", error);
    printDeleted(context.out, data);
    return 0;
  },
});

// ── Event types ─────────────────────────────────────────────────────────────────────────────────

const KINDS: readonly SchedulingEventTypeKind[] = ["one_on_one", "pool", "collective", "group"];
const EVENT_TYPE_STATUSES = ["active", "archived"] as const;

function printEventType(out: Output, type: SchedulingEventType): void {
  out.line(
    `${type.id} ${printable(type.title)}${type.status === "active" ? "" : out.style("yellow", ` (${type.status})`)}`,
  );
  if (type.uid) out.line(`  Uid       ${printable(type.uid)}`);
  out.line(`  Kind      ${type.kind}, ${type.duration_minutes} minutes`);
  out.line(`  Hosts     ${type.hosts.map((host) => host.host).join(", ") || "none"}`);
  if (type.requires_approval) out.line("  Bookings need approval");
}

const EVENT_TYPE_FLAGS = {
  minutes: { type: "string", value: "<n>", description: "How long it lasts" },
  uid: { type: "string", value: "<uid>", description: "Your own id for it" },
  host: {
    type: "string",
    multiple: true,
    value: "<host>",
    description: "A host who takes it, by id or uid (repeatable)",
  },
  "requires-approval": { type: "boolean", description: "Bookings wait for approval" },
  "no-approval": { type: "boolean", description: "Bookings are confirmed at once" },
  data: {
    type: "string",
    value: "<json>",
    description:
      "More of the request body (buffers, limits, questions, locations…), as JSON: inline, @file " +
      "or - for stdin; flags win over it",
  },
  json: { type: "boolean", description: "Print the event type as JSON" },
} as const satisfies Flags;

type EventTypeValues = CommandInput<typeof EVENT_TYPE_FLAGS>["values"];

async function eventTypeFields(context: Context, values: EventTypeValues) {
  const minutes = integerOf("--minutes", values.minutes);
  const approval = eitherOf(values["requires-approval"], values["no-approval"], [
    "--requires-approval",
    "--no-approval",
  ]);
  const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
  return {
    ...base,
    ...(minutes !== undefined && { duration_minutes: minutes }),
    ...(values.host && { hosts: values.host.map((host) => ({ host })) }),
    ...(approval !== undefined && { requires_approval: approval }),
  };
}

const EVENT_TYPE_CREATE_FLAGS = {
  ...EVENT_TYPE_FLAGS,
  kind: {
    type: "string",
    value: "<kind>",
    choices: KINDS,
    description: "one_on_one (the default), pool, collective or group",
  },
} as const satisfies Flags;

const eventTypesCreate: Command = defineCommand({
  name: "scheduling event-types create",
  summary: "Create something that can be booked",
  usage: "<title> --minutes <n> [options]",
  description:
    "Creates an event type. Creation is never retried, since the API doesn't deduplicate it.",
  flags: EVENT_TYPE_CREATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof EVENT_TYPE_CREATE_FLAGS>) => {
    const [title] = requireArgs(
      positionals,
      1,
      "scheduling event-types create <title> --minutes <n>",
    ) as [string];
    const kind = oneOf("--kind", values.kind, KINDS);
    const fields = await eventTypeFields(context, values);
    if (!("duration_minutes" in fields)) throw new UsageError("Pass --minutes <n>.");
    const coss = await client(context);
    const { data, error } = await coss.scheduling.eventTypes.create({
      ...fields,
      title,
      ...(values.uid !== undefined && { uid: values.uid }),
      ...(kind && { kind }),
    } as CreateSchedulingEventTypeParams);
    if (error) throw apiError("Couldn't create the event type", error);
    printOne(context.out, data, printEventType);
    return 0;
  },
});

const EVENT_TYPE_UPDATE_FLAGS = {
  title: { type: "string", value: "<title>", description: "Its new title" },
  status: {
    type: "string",
    value: "<status>",
    choices: EVENT_TYPE_STATUSES,
    description: "active or archived",
  },
  ...EVENT_TYPE_FLAGS,
  uid: { type: "string", value: "<uid>", description: "Your own id for it (none: remove it)" },
  host: {
    type: "string",
    multiple: true,
    value: "<host>",
    description: "Replaces the hosts (repeatable; those removed keep their bookings)",
  },
} as const satisfies Flags;

const eventTypesUpdate: Command = defineCommand({
  name: "scheduling event-types update",
  summary: "Change an event type, or archive it",
  usage: "<event-type> [options]",
  description: "Changes what is given on an event type, by id or uid; the rest stays.",
  flags: EVENT_TYPE_UPDATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof EVENT_TYPE_UPDATE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling event-types update <event-type>") as [
      string,
    ];
    const status = oneOf("--status", values.status, EVENT_TYPE_STATUSES);
    const params = {
      ...(await eventTypeFields(context, values)),
      ...(values.title !== undefined && { title: values.title }),
      ...(values.uid !== undefined && { uid: orNull(values.uid, "none") }),
      ...(status && { status }),
    } as UpdateSchedulingEventTypeParams;
    if (Object.keys(params).length === 0) {
      throw new UsageError(
        "Pass at least one thing to change (coss scheduling event-types update --help).",
      );
    }
    const coss = await client(context);
    const { data, error } = await coss.scheduling.eventTypes.update(id, params);
    if (error) throw apiError("Couldn't change the event type", error);
    printOne(context.out, data, printEventType);
    return 0;
  },
});

// ── Booking ─────────────────────────────────────────────────────────────────────────────────────

const BOOK_FLAGS = {
  start: { type: "string", value: "<time>", description: "When: a start from `scheduling slots`" },
  name: { type: "string", value: "<name>", description: "The attendee's name" },
  email: { type: "string", value: "<address>", description: "The attendee's address" },
  phone: { type: "string", value: "<number>", description: "The attendee's number" },
  "time-zone": { type: "string", value: "<zone>", description: "The attendee's IANA time zone" },
  uid: { type: "string", value: "<uid>", description: "Your own id for the attendee" },
  host: { type: "string", value: "<host>", description: "This host (default: chosen fairly)" },
  minutes: { type: "string", value: "<n>", description: "One of the event type's durations" },
  attribute: {
    type: "string",
    multiple: true,
    value: "<name=value>",
    description: "Narrows a pool: licensed_in=CA (repeat a name for a list)",
  },
  answer: {
    type: "string",
    multiple: true,
    value: "<name=value>",
    description: "An answer to one of the event type's questions (repeat a name for a list)",
  },
  metadata: {
    type: "string",
    multiple: true,
    value: "<name=value>",
    description: "Metadata (repeatable)",
  },
  data: DATA_FLAG,
  yes: { type: "boolean", description: "Don't ask before telling people with a live key" },
  json: { type: "boolean", description: "Print the booking as JSON" },
} as const satisfies Flags;

const book: Command = defineCommand({
  name: "scheduling book",
  summary: "Book a slot and tell the attendee and hosts",
  usage: "<event-type> --start <time> --time-zone <zone> [options]",
  description:
    "Books a slot (`coss scheduling slots` lists them): it holds the time, adds the calendar " +
    "event and tells the attendee and hosts. With a live key it asks first; off a terminal it " +
    "needs --yes.",
  flags: BOOK_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof BOOK_FLAGS>) => {
    const [eventType] = requireArgs(
      positionals,
      1,
      "scheduling book <event-type> --start <time> --time-zone <zone>",
    ) as [string];
    const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
    const baseAttendee = (base.attendee ?? {}) as Partial<
      CreateSchedulingBookingParams["attendee"]
    >;
    const start = values.start ?? (base.start as string | undefined);
    const zone = values["time-zone"] ?? baseAttendee.time_zone;
    if (!start || !zone) throw new UsageError("A booking needs --start and --time-zone.");
    const minutes = integerOf("--minutes", values.minutes);
    const attributes: SchedulingAttributes | undefined = multiPairs(values.attribute, "attribute");
    const answers = multiPairs(values.answer, "answer");
    const metadata = pairsOf(values.metadata, "metadata");
    const params = {
      ...base,
      event_type: eventType,
      start,
      attendee: {
        ...baseAttendee,
        time_zone: zone,
        ...(values.name !== undefined && { name: values.name }),
        ...(values.email !== undefined && { email: values.email }),
        ...(values.phone !== undefined && { phone: values.phone }),
        ...(values.uid !== undefined && { uid: values.uid }),
      },
      ...(values.host !== undefined && { host: values.host }),
      ...(minutes !== undefined && { duration_minutes: minutes }),
      ...(attributes && { attributes }),
      ...(answers && { answers }),
      ...(metadata && { metadata }),
    } as CreateSchedulingBookingParams;
    const credentials = await resolveCredentials(context);
    const who = params.attendee.email ?? params.attendee.name ?? "the attendee";
    const go = await confirmLive(
      context,
      credentials.apiKey,
      values.yes,
      `Book ${who} on ${eventType} at ${start} and tell them?`,
    );
    if (!go) return 1;
    const coss = clientFor(context.io, credentials);
    const { data, error } = await coss.scheduling.bookings.create(params);
    if (error) throw apiError("Couldn't book the slot", error);
    printBooking(context, data);
    return 0;
  },
});

const RESCHEDULE_FLAGS = {
  start: { type: "string", value: "<time>", description: "The new start" },
  host: { type: "string", value: "<host>", description: "Move a pool booking to this host" },
  yes: { type: "boolean", description: "Don't ask before telling people with a live key" },
  json: { type: "boolean", description: "Print the booking as JSON" },
} as const satisfies Flags;

const reschedule: Command = defineCommand({
  name: "scheduling reschedule",
  summary: "Move a booking and tell the attendee",
  usage: "<booking> --start <time> [options]",
  description:
    "Moves a booking, keeping its id; the old time stays booked if the new one isn't free. It " +
    "tells the attendee, so with a live key it asks first; off a terminal it needs --yes.",
  flags: RESCHEDULE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof RESCHEDULE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling reschedule <booking> --start <time>") as [
      string,
    ];
    if (!values.start) throw new UsageError("Pass --start <time>.");
    const credentials = await resolveCredentials(context);
    const go = await confirmLive(
      context,
      credentials.apiKey,
      values.yes,
      `Move ${id} to ${values.start} and tell the attendee?`,
    );
    if (!go) return 1;
    const coss = clientFor(context.io, credentials);
    const { data, error } = await coss.scheduling.bookings.reschedule(id, {
      start: values.start,
      ...(values.host !== undefined && { host: values.host }),
    });
    if (error) throw apiError("Couldn't move the booking", error);
    printBooking(context, data);
    return 0;
  },
});

const DECIDE_FLAGS = {
  yes: { type: "boolean", description: "Don't ask before telling people with a live key" },
  json: { type: "boolean", description: "Print the booking as JSON" },
} as const satisfies Flags;

const approve: Command = defineCommand({
  name: "scheduling approve",
  summary: "Confirm a booking waiting for approval",
  usage: "<booking> [--yes]",
  description:
    "Confirms a pending_approval booking. It tells the attendee, so with a live key it asks " +
    "first; off a terminal it needs --yes.",
  flags: DECIDE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof DECIDE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling approve <booking>") as [string];
    const credentials = await resolveCredentials(context);
    const go = await confirmLive(
      context,
      credentials.apiKey,
      values.yes,
      `Confirm ${id} and tell the attendee?`,
    );
    if (!go) return 1;
    const coss = clientFor(context.io, credentials);
    const { data, error } = await coss.scheduling.bookings.approve(id);
    if (error) throw apiError("Couldn't approve the booking", error);
    printBooking(context, data);
    return 0;
  },
});

const decline: Command = defineCommand({
  name: "scheduling decline",
  summary: "Refuse a booking waiting for approval",
  usage: "<booking> [--yes]",
  description:
    "Refuses a pending_approval booking and frees the time. It tells the attendee, so with a " +
    "live key it asks first; off a terminal it needs --yes.",
  flags: DECIDE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof DECIDE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "scheduling decline <booking>") as [string];
    const credentials = await resolveCredentials(context);
    const go = await confirmLive(
      context,
      credentials.apiKey,
      values.yes,
      `Refuse ${id} and tell the attendee?`,
    );
    if (!go) return 1;
    const coss = clientFor(context.io, credentials);
    const { data, error } = await coss.scheduling.bookings.decline(id);
    if (error) throw apiError("Couldn't decline the booking", error);
    printBooking(context, data);
    return 0;
  },
});

export const SCHEDULING_COMMANDS: readonly Command[] = [
  hosts,
  { ...hosts, name: "scheduling hosts list" },
  hostsCreate,
  hostsUpdate,
  hostsRemove,
  schedulesList,
  schedulesCreate,
  schedulesUpdate,
  schedulesRemove,
  eventTypes,
  { ...eventTypes, name: "scheduling event-types list" },
  eventTypesCreate,
  eventTypesUpdate,
  explain,
  slots,
  book,
  bookings,
  booking,
  bookingEvents,
  reschedule,
  approve,
  decline,
  cancel,
  reassign,
  candidates,
  reassignMany,
  reassignments,
  reassignment,
  outOfOffice,
  calendars,
];
