/**
 * `coss risk …`: try assessments against the environment's rules and lists, work its review queue,
 * and manage its allow and block lists, on the public API.
 */
import type {
  AssessRiskParams,
  Coss,
  RiskAssessment,
  RiskDecision,
  RiskEvent,
  RiskList,
  RiskListEntryType,
  RiskOutcome,
  RiskReason,
} from "coss";
import { type Flags, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { type Context, clientFor, resolveCredentials } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import { jsonObject } from "../fields.ts";
import type { Output, Style } from "../output.ts";
import { table } from "../table.ts";

export const EVENTS: readonly RiskEvent[] = ["signup", "login", "message", "checkout", "custom"];
export const DECISIONS: readonly RiskDecision[] = ["allow", "review", "block"];
const OUTCOMES: readonly RiskOutcome[] = ["legitimate", "fraud", "abuse"];
const LISTS: readonly RiskList[] = ["allow", "block"];
const ENTRY_TYPES: readonly RiskListEntryType[] = [
  "email",
  "domain",
  "ip",
  "asn",
  "country",
  "user",
];

const LIMIT = {
  type: "string",
  value: "<n>",
  description: "How many to show, 1-100 (default 50)",
} as const;

async function riskClient(context: Context): Promise<Coss> {
  return clientFor(context.io, await resolveCredentials(context));
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string,
): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new UsageError(`${flag} takes ${allowed.join(", ")}; got "${value}".`);
  }
  return value as T;
}

function limitOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new UsageError("--limit takes a number from 1 to 100.");
  }
  return limit;
}

function when(iso: string | null): string {
  return iso ? iso.slice(0, 16).replace("T", " ") : "";
}

function decisionStyle(decision: RiskDecision): Style {
  return decision === "allow" ? "green" : decision === "review" ? "yellow" : "red";
}

/** What a reason adds to its message: the count, the suggestion, the matched entry, the rule. */
function reasonDetail(reason: RiskReason): string {
  const details = [
    reason.value !== undefined &&
      `${reason.value}${reason.threshold === undefined ? "" : `/${reason.threshold}`}${reason.window ? ` in ${reason.window}` : ""}`,
    reason.suggestion && `did you mean ${reason.suggestion}?`,
    reason.provider,
    reason.entry && `entry ${reason.entry}`,
    reason.name && `rule "${reason.name}"`,
  ].filter(Boolean);
  return details.join(", ");
}

/** The decision line, then one line per reason. */
export function printAssessment(out: Output, assessment: RiskAssessment): void {
  out.line(
    `${out.style(["bold", decisionStyle(assessment.decision)], assessment.decision)}  score ${assessment.score.toFixed(2)}  ${out.style("dim", assessment.id)}`,
  );
  const rows = assessment.reasons.map((reason) => {
    // Messages and details can quote what was assessed (an address, a name): never escape sequences.
    const detail = printable(reasonDetail(reason));
    return [
      `  ${reason.code}`,
      printable(reason.message) + (detail ? out.style("dim", ` (${detail})`) : ""),
    ];
  });
  for (const line of table(rows)) out.line(line);
  if (assessment.reasons.length === 0)
    out.line(out.style("dim", "  No reasons: nothing looked risky."));
  if (assessment.degraded.length > 0) {
    out.warn(`Decided without: ${assessment.degraded.join(", ")} (a lookup failed or timed out).`);
  }
}

// ── Assess ──────────────────────────────────────────────────────────────────────────────────────

const ASSESS_FLAGS = {
  event: {
    type: "string",
    value: "<event>",
    choices: EVENTS,
    description: "signup, login, message, checkout or custom",
  },
  "event-name": {
    type: "string",
    value: "<name>",
    description: "A custom event's name (e.g. invite_sent)",
  },
  email: { type: "string", value: "<address>", description: "The address the user gave" },
  ip: { type: "string", value: "<address>", description: "The client's IP address" },
  user: { type: "string", value: "<id>", description: "Your id for the user" },
  "user-agent": { type: "string", value: "<text>", description: "The client's user agent" },
  content: {
    type: "string",
    value: "<text>",
    description: "Text the user wrote, to classify (a bio, a message)",
  },
  captcha: { type: "string", value: "<token>", description: "The captcha widget's token" },
  device: { type: "string", value: "<token>", description: "The token coss/device collected" },
  data: {
    type: "string",
    value: "<json>",
    description:
      "More of the request body (e.g. checkout), as JSON: inline, @file or - for stdin; the " +
      "flags above win over it",
  },
  json: { type: "boolean", description: "Print the whole assessment as JSON" },
} as const satisfies Flags;

const assess: Command = defineCommand({
  name: "risk assess",
  summary: "Assess an event (sign-up, login…) and show the decision",
  usage: "--event <event> [options]",
  description:
    "Assesses one event with the environment's signals, rules and lists, as `coss.risk.assess()` " +
    "does, and prints the decision, its score and why. It counts like any assessment " +
    "(velocity, the review queue).\n\n" +
    "Sandbox environments decide from fixtures, so each decision can be produced on purpose: " +
    "IPs 192.0.2.1 (Tor), 192.0.2.2 (a cloud), 192.0.2.3 (a VPN), 192.0.2.4 (a proxy), " +
    "192.0.2.5 (a privacy relay); emails at disposable.test, undeliverable.test or new.test; " +
    "captcha tokens test-pass and test-fail; device token test-device-automated; and content " +
    "with [coss-test:spam] (or phishing, malware, fraud; [coss-test:spam:0.6] for a score). " +
    "See https://coss.com/docs/risk/testing",
  flags: ASSESS_FLAGS,
  run: async ({ values, context }: CommandInput<typeof ASSESS_FLAGS>) => {
    const { io, out } = context;
    const base = values.data === undefined ? {} : await jsonObject(io, values.data, "data");
    const event = oneOf(values.event, EVENTS, "--event") ?? (base.event as RiskEvent | undefined);
    if (event === undefined) {
      throw new UsageError(`Pass --event: ${EVENTS.join(", ")}.`);
    }
    const baseUser = (base.user ?? {}) as NonNullable<AssessRiskParams["user"]>;
    const user = {
      ...baseUser,
      ...(values.user !== undefined && { id: values.user }),
      ...(values.email !== undefined && { email: values.email }),
    };
    const params = {
      ...base,
      event,
      ...(values["event-name"] !== undefined && { event_name: values["event-name"] }),
      ...(Object.keys(user).length > 0 && { user }),
      ...(values.ip !== undefined && { ip: values.ip }),
      ...(values["user-agent"] !== undefined && { user_agent: values["user-agent"] }),
      ...(values.content !== undefined && { content: { text: values.content } }),
      ...(values.captcha !== undefined && { captcha: { token: values.captcha } }),
      ...(values.device !== undefined && { device: { token: values.device } }),
    } as AssessRiskParams;
    const coss = await riskClient(context);
    const { data, error } = await coss.risk.assess(params, { signal: io.signal });
    if (error) throw apiError("Couldn't assess the event", error);
    if (out.json) out.data(data);
    else printAssessment(out, data);
    return 0;
  },
});

// ── Assessments and feedback ────────────────────────────────────────────────────────────────────

const ASSESSMENTS_FLAGS = {
  decision: {
    type: "string",
    value: "<decision>",
    choices: DECISIONS,
    description: "allow, review or block",
  },
  event: { type: "string", value: "<event>", choices: EVENTS, description: "Only this event" },
  user: { type: "string", value: "<id>", description: "Only this user's" },
  review: {
    type: "string",
    value: "<status>",
    choices: ["open", "resolved"],
    description: "open (the review queue: reviews without feedback yet) or resolved",
  },
  limit: LIMIT,
  json: { type: "boolean", description: "One assessment per line, as JSON" },
} as const satisfies Flags;

const assessments: Command = defineCommand({
  name: "risk assessments",
  summary: "List assessments (--review open: the review queue)",
  description: "Lists the environment's assessments, newest first.",
  flags: ASSESSMENTS_FLAGS,
  run: async ({ values, context }: CommandInput<typeof ASSESSMENTS_FLAGS>) => {
    const decision = oneOf(values.decision, DECISIONS, "--decision");
    const event = oneOf(values.event, EVENTS, "--event");
    const review = oneOf(values.review, ["open", "resolved"] as const, "--review");
    const coss = await riskClient(context);
    const { data, error } = await coss.risk.assessments.list({
      ...(decision && { decision }),
      ...(event && { event }),
      ...(review && { review_status: review }),
      ...(values.user !== undefined && { user_id: values.user }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the assessments", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("No assessments.");
      return 0;
    }
    const lines = table([
      ["ID", "EVENT", "DECISION", "SCORE", "USER", "OUTCOME", "CREATED"],
      ...data.data.map((item) => [
        item.id,
        // What the customer's users typed: never escape sequences.
        printable(item.event_name ?? item.event),
        out.style(decisionStyle(item.decision), item.decision),
        item.score.toFixed(2),
        printable(item.user.email ?? item.user.id ?? ""),
        item.outcome ?? (item.review_status === "open" ? out.style("yellow", "to review") : ""),
        when(item.created_at),
      ]),
    ]);
    out.line(out.style("dim", lines[0] ?? ""));
    for (const line of lines.slice(1)) out.line(line);
    if (data.has_more) {
      out.info(
        out.style("dim", "There are more: `coss api risk/assessments --paginate` lists them all."),
      );
    }
    return 0;
  },
});

const FEEDBACK_FLAGS = {
  outcome: {
    type: "string",
    value: "<outcome>",
    choices: OUTCOMES,
    description: "What the user turned out to be: legitimate, fraud or abuse",
  },
  note: { type: "string", value: "<text>", description: "For your team; never shared" },
  json: { type: "boolean", description: "Print the assessment as JSON" },
} as const satisfies Flags;

const feedback: Command = defineCommand({
  name: "risk feedback",
  summary: "Report what an assessed user turned out to be",
  usage: "<assessment> --outcome <outcome> [--note <text>]",
  description:
    "Reports an assessment's outcome: fraud and abuse teach later assessments to flag the same " +
    "mailbox, user, card, device, IP and subnet; legitimate takes that back. Resolves a review.",
  flags: FEEDBACK_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof FEEDBACK_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "risk feedback <assessment> --outcome <outcome>") as [
      string,
    ];
    const outcome = oneOf(values.outcome, OUTCOMES, "--outcome");
    if (!outcome) throw new UsageError(`Pass --outcome: ${OUTCOMES.join(", ")}.`);
    const coss = await riskClient(context);
    const { data, error } = await coss.risk.feedback(id, {
      outcome,
      ...(values.note !== undefined && { note: values.note }),
    });
    if (error) throw apiError("Couldn't send the feedback", error);
    const { out } = context;
    if (out.json) out.data(data);
    else out.line(`${out.style("green", "✔")} Marked ${data.id} ${outcome}`);
    return 0;
  },
});

// ── Lists ───────────────────────────────────────────────────────────────────────────────────────

const LISTS_LIST_FLAGS = {
  list: { type: "string", value: "<list>", choices: LISTS, description: "allow or block" },
  type: {
    type: "string",
    value: "<type>",
    choices: ENTRY_TYPES,
    description: "email, domain, ip, asn, country or user",
  },
  limit: LIMIT,
  json: { type: "boolean", description: "One entry per line, as JSON" },
} as const satisfies Flags;

const listsList: Command = defineCommand({
  name: "risk lists list",
  summary: "List the allow and block lists' entries",
  description: "Lists the entries of the environment's allow and block lists, newest first.",
  flags: LISTS_LIST_FLAGS,
  run: async ({ values, context }: CommandInput<typeof LISTS_LIST_FLAGS>) => {
    const listName = oneOf(values.list, LISTS, "--list");
    const type = oneOf(values.type, ENTRY_TYPES, "--type");
    const coss = await riskClient(context);
    const { data, error } = await coss.risk.lists.list({
      ...(listName && { list: listName }),
      ...(type && { type }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the entries", error);
    const { out } = context;
    if (out.json) {
      for (const item of data.data) out.data(item);
      return 0;
    }
    if (data.data.length === 0) {
      out.info("No entries: `coss risk lists add block domain <domain>` adds one.");
      return 0;
    }
    const lines = table([
      ["ID", "LIST", "TYPE", "VALUE", "EXPIRES", "NOTE"],
      ...data.data.map((entry) => [
        entry.id,
        out.style(entry.list === "allow" ? "green" : "red", entry.list),
        entry.type,
        printable(entry.value),
        when(entry.expires_at),
        printable(entry.note ?? ""),
      ]),
    ]);
    out.line(out.style("dim", lines[0] ?? ""));
    for (const line of lines.slice(1)) out.line(line);
    if (data.has_more) {
      out.info(
        out.style("dim", "There are more: `coss api risk/list_entries --paginate` lists them all."),
      );
    }
    return 0;
  },
});

const UNITS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

/** `--expires`: `30m`, `12h`, `7d` from now, or an ISO 8601 time. */
export function expiresAt(value: string, now: Date): string {
  const match = /^(\d+)\s*([mhd])$/.exec(value.trim());
  if (match) {
    return new Date(now.getTime() + Number(match[1]) * (UNITS[match[2] ?? "d"] ?? 0)).toISOString();
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new UsageError("--expires takes 30m, 12h, 7d (from now) or an ISO 8601 time.");
  }
  return new Date(time).toISOString();
}

const LISTS_ADD_FLAGS = {
  note: { type: "string", value: "<text>", description: "Why it's there, for your team" },
  expires: {
    type: "string",
    value: "<time>",
    description: "Stop matching then: 30m, 12h, 7d from now, or an ISO 8601 time",
  },
  json: { type: "boolean", description: "Print the entry as JSON" },
} as const satisfies Flags;

const listsAdd: Command = defineCommand({
  name: "risk lists add",
  summary: "Add an entry to the allow or block list",
  usage: "<allow|block> <email|domain|ip|asn|country|user> <value> [options]",
  description:
    "Adds an entry, e.g. `coss risk lists add block domain evil.example` or `coss risk lists add " +
    "allow ip 203.0.113.0/24`: a block-list match makes decisions block, an allow-list match " +
    "allow. Emails match by mailbox (dots and +tags folded), domains include subdomains, IPs " +
    "may be CIDR ranges.",
  flags: LISTS_ADD_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof LISTS_ADD_FLAGS>) => {
    const [listArg, typeArg, value] = requireArgs(
      positionals,
      3,
      "risk lists add <allow|block> <type> <value>",
    ) as [string, string, string];
    const listName = oneOf(listArg, LISTS, "The list") as RiskList;
    const type = oneOf(typeArg, ENTRY_TYPES, "The type") as RiskListEntryType;
    const expires =
      values.expires === undefined ? undefined : expiresAt(values.expires, context.io.now());
    const coss = await riskClient(context);
    const { data, error } = await coss.risk.lists.add(listName, {
      [type]: value,
      ...(values.note !== undefined && { note: values.note }),
      ...(expires !== undefined && { expires_at: expires }),
    } as Parameters<Coss["risk"]["lists"]["add"]>[1]);
    if (error) throw apiError("Couldn't add the entry", error);
    const { out } = context;
    if (out.json) out.data(data);
    else {
      out.line(
        `${out.style("green", "✔")} ${data.list === "allow" ? "Allowed" : "Blocked"} ${data.type} ${data.value} ${out.style("dim", data.id)}`,
      );
    }
    return 0;
  },
});

const LISTS_REMOVE_FLAGS = {
  json: { type: "boolean", description: "Print the result as JSON" },
} as const satisfies Flags;

const listsRemove: Command = defineCommand({
  name: "risk lists remove",
  summary: "Remove an allow or block list entry",
  usage: "<entry>",
  description: "Removes an entry (its id, from `coss risk lists list`).",
  flags: LISTS_REMOVE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof LISTS_REMOVE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "risk lists remove <entry>") as [string];
    const coss = await riskClient(context);
    const { data, error } = await coss.risk.lists.remove(id);
    if (error) throw apiError("Couldn't remove the entry", error);
    const { out } = context;
    if (out.json) out.data(data);
    else out.line(`${out.style("green", "✔")} Removed ${data.id}`);
    return 0;
  },
});

/** In the order `coss --help` lists them. */
export const RISK_COMMANDS: readonly Command[] = [
  assess,
  assessments,
  feedback,
  listsList,
  listsAdd,
  listsRemove,
];
