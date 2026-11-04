/**
 * `coss risk rules …`, `coss risk check …`, `coss risk classify`, `coss risk settings …`: what an
 * environment decides with, and the signals on their own, on the public API.
 */
import type {
  CreateRiskRuleParams,
  RiskEvent,
  RiskRule,
  RiskRuleCondition,
  RiskSettings,
  UpdateRiskRuleParams,
  UpdateRiskSettingsParams,
} from "coss";
import { type Flags, jsonOrString, list as listOf, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import type { Context } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, UsageError } from "../errors.ts";
import { jsonObject } from "../fields.ts";
import type { Output } from "../output.ts";
import { table } from "../table.ts";
import {
  client,
  eitherOf,
  fileText,
  integerOf,
  numberOf,
  oneOf,
  printDeleted,
  printList,
  printOne,
  secretInput,
} from "./list-output.ts";
import { DECISIONS, EVENTS } from "./risk.ts";

// ── Rules ───────────────────────────────────────────────────────────────────────────────────────

const MATCHES = ["all", "any"] as const;
const OPERATORS: readonly RiskRuleCondition["operator"][] = [
  "is",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
];

/** `--condition "ip.tor is true"`, `"velocity.ip_1h gt 10"`, `"ip.country in RU,KP"`. */
export function parseCondition(text: string): RiskRuleCondition {
  const match = /^\s*(\S+)\s+(\S+)\s+(.*\S)\s*$/s.exec(text);
  if (!match) {
    throw new UsageError(
      `--condition takes "<field> <operator> <value>", e.g. "ip.tor is true"; got "${text}".`,
    );
  }
  const [, field, operator, raw] = match as unknown as [string, string, string, string];
  const op = oneOf("A condition's operator", operator, OPERATORS) as RiskRuleCondition["operator"];
  let value: RiskRuleCondition["value"];
  if (op === "in" || op === "not_in") value = listOf(raw);
  else {
    const parsed = jsonOrString(raw);
    value =
      typeof parsed === "boolean" || typeof parsed === "number" || typeof parsed === "string"
        ? parsed
        : raw;
  }
  return { field: field as RiskRuleCondition["field"], operator: op, value };
}

function describeCondition(condition: RiskRuleCondition): string {
  const value = Array.isArray(condition.value) ? condition.value.join(",") : condition.value;
  return `${condition.field} ${condition.operator} ${value}`;
}

function printRule(out: Output, rule: RiskRule): void {
  out.line(
    `${rule.id} ${printable(rule.name)} → ${rule.action}${rule.enabled ? "" : out.style("yellow", " (disabled)")}`,
  );
  out.line(
    `  Position ${rule.position}, events ${rule.events.length > 0 ? rule.events.join(", ") : "all"}, match ${rule.match}`,
  );
  // Values someone typed into a rule: never escape sequences.
  for (const condition of rule.conditions) out.line(`  ${printable(describeCondition(condition))}`);
}

const RULES_LIST_FLAGS = {
  json: { type: "boolean", description: "One rule per line, as JSON" },
} as const satisfies Flags;

const rulesList: Command = defineCommand({
  name: "risk rules list",
  summary: "List the environment's rules, in the order they're tried",
  description:
    "Lists the rules: the first enabled one whose conditions match decides, after the allow and " +
    "block lists.",
  flags: RULES_LIST_FLAGS,
  run: async ({ context }: CommandInput<typeof RULES_LIST_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.risk.rules.list();
    if (error) throw apiError("Couldn't list the rules", error);
    const { out } = context;
    printList(out, data.data, {
      empty: 'No rules: `coss risk rules create "name" --action block --condition …` adds one.',
      header: ["ID", "POS", "NAME", "ACTION", "ENABLED", "CONDITIONS"],
      row: (item) => [
        item.id,
        String(item.position),
        printable(item.name),
        item.action,
        item.enabled ? "yes" : out.style("yellow", "no"),
        String(item.conditions.length),
      ],
    });
    return 0;
  },
});

const RULE_FLAGS = {
  json: { type: "boolean", description: "Print the rule as JSON" },
} as const satisfies Flags;

const rulesGet: Command = defineCommand({
  name: "risk rules get",
  summary: "Show a rule and its conditions",
  usage: "<rule>",
  description: "Shows a rule: what it applies to, its conditions and what it decides.",
  flags: RULE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof RULE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "risk rules get <rule>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.risk.rules.get(id);
    if (error) throw apiError("Couldn't read the rule", error);
    printOne(context.out, data, printRule);
    return 0;
  },
});

const RULE_WRITE_FLAGS = {
  action: {
    type: "string",
    value: "<decision>",
    choices: DECISIONS,
    description: "What it decides: allow, review or block",
  },
  condition: {
    type: "string",
    multiple: true,
    value: '"<field> <op> <value>"',
    description:
      'A test of one field: "ip.tor is true", "velocity.ip_1h gt 10", "ip.country in RU,KP" ' +
      "(repeatable; operators is, eq, neq, gt, gte, lt, lte, in, not_in)",
  },
  match: {
    type: "string",
    value: "<match>",
    choices: MATCHES,
    description: "all (every condition must hold, the default) or any (one is enough)",
  },
  event: {
    type: "string",
    multiple: true,
    value: "<event>",
    choices: EVENTS,
    description: "Only these events: signup, login, message, checkout, custom (repeatable)",
  },
  position: { type: "string", value: "<n>", description: "Rules are tried in ascending order" },
  enabled: { type: "boolean", description: "Decide with it" },
  disabled: { type: "boolean", description: "Keep it, without deciding with it" },
  data: {
    type: "string",
    value: "<json>",
    description:
      "The request body, or more of it, as JSON: inline, @file or - for stdin; the flags above " +
      "win over it",
  },
  json: { type: "boolean", description: "Print the rule as JSON" },
} as const satisfies Flags;

type RuleWriteValues = CommandInput<typeof RULE_WRITE_FLAGS>["values"];

async function ruleFields(context: Context, values: RuleWriteValues) {
  const action = oneOf("--action", values.action, DECISIONS);
  const match = oneOf("--match", values.match, MATCHES);
  const events = values.event
    ? listOf(values.event).map((event) => oneOf("--event", event, EVENTS) as RiskEvent)
    : undefined;
  const position = integerOf("--position", values.position);
  const enabled = eitherOf(values.enabled, values.disabled, ["--enabled", "--disabled"]);
  const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
  return {
    ...base,
    ...(action && { action }),
    ...(values.condition && { conditions: values.condition.map(parseCondition) }),
    ...(match && { match }),
    ...(events && { events }),
    ...(position !== undefined && { position }),
    ...(enabled !== undefined && { enabled }),
  };
}

const rulesCreate: Command = defineCommand({
  name: "risk rules create",
  summary: "Add a rule",
  usage: "<name> --action <decision> --condition <condition> [options]",
  description:
    "Adds a rule. Fields are the signals of https://coss.com/docs/risk/rules, such as ip.tor, " +
    "email.disposable, velocity.ip_1h, ip.country and score. A field without a value never " +
    "matches. Creation is never retried, since the API doesn't deduplicate it.",
  flags: RULE_WRITE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof RULE_WRITE_FLAGS>) => {
    const [name] = requireArgs(positionals, 1, "risk rules create <name> --action <decision>") as [
      string,
    ];
    const fields = await ruleFields(context, values);
    if (!("action" in fields) || !("conditions" in fields)) {
      throw new UsageError("A rule needs --action and at least one --condition.");
    }
    const coss = await client(context);
    const { data, error } = await coss.risk.rules.create({
      ...fields,
      name,
    } as unknown as CreateRiskRuleParams);
    if (error) throw apiError("Couldn't create the rule", error);
    printOne(context.out, data, printRule);
    return 0;
  },
});

const RULE_UPDATE_FLAGS = {
  name: { type: "string", value: "<name>", description: "Its new name" },
  ...RULE_WRITE_FLAGS,
  condition: {
    ...RULE_WRITE_FLAGS.condition,
    description: 'Replaces its conditions: "ip.tor is true" (repeatable)',
  },
} as const satisfies Flags;

const rulesUpdate: Command = defineCommand({
  name: "risk rules update",
  summary: "Change a rule, or enable or disable it",
  usage: "<rule> [options]",
  description: "Changes what is given; --condition replaces all of its conditions.",
  flags: RULE_UPDATE_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof RULE_UPDATE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "risk rules update <rule> [options]") as [string];
    const params = {
      ...(await ruleFields(context, values)),
      ...(values.name !== undefined && { name: values.name }),
    } as UpdateRiskRuleParams;
    if (Object.keys(params).length === 0) {
      throw new UsageError("Pass at least one thing to change (coss risk rules update --help).");
    }
    const coss = await client(context);
    const { data, error } = await coss.risk.rules.update(id, params);
    if (error) throw apiError("Couldn't change the rule", error);
    printOne(context.out, data, printRule);
    return 0;
  },
});

const RULE_DELETE_FLAGS = {
  json: { type: "boolean", description: "Print the result as JSON" },
} as const satisfies Flags;

const rulesDelete: Command = defineCommand({
  name: "risk rules delete",
  summary: "Delete a rule",
  usage: "<rule>",
  description:
    "Deletes a rule. To keep it without deciding with it: `coss risk rules update <rule> " +
    "--disabled`.",
  flags: RULE_DELETE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof RULE_DELETE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "risk rules delete <rule>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.risk.rules.delete(id);
    if (error) throw apiError("Couldn't delete the rule", error);
    printDeleted(context.out, data);
    return 0;
  },
});

// ── Signals on their own ────────────────────────────────────────────────────────────────────────

function printFacts(out: Output, facts: [string, string][], degraded: readonly string[]): void {
  for (const line of table(facts.map(([name, value]) => [`  ${name}`, printable(value)]))) {
    out.line(line);
  }
  if (degraded.length > 0) out.warn(`Answered without: ${degraded.join(", ")}.`);
}

const yesNo = (value: boolean): string => (value ? "yes" : "no");

const CHECK_FLAGS = {
  json: { type: "boolean", description: "Print the answer as JSON" },
} as const satisfies Flags;

const checkEmail: Command = defineCommand({
  name: "risk check email",
  summary: "Check an address: disposable, deliverable, typos…",
  usage: "<address>",
  description:
    "Checks an address on its own: syntax, disposable domains, deliverability, role accounts, " +
    "free providers, the canonical mailbox, typos and domain age. Nothing is stored.",
  flags: CHECK_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof CHECK_FLAGS>) => {
    const [email] = requireArgs(positionals, 1, "risk check email <address>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.risk.checkEmail(email);
    if (error) throw apiError("Couldn't check the address", error);
    const { out } = context;
    if (out.json) {
      out.data(data);
      return 0;
    }
    out.line(printable(data.email));
    printFacts(
      out,
      [
        ["Valid", yesNo(data.valid)],
        ["Deliverability", data.deliverability],
        ["Disposable", yesNo(data.disposable)],
        ["Role account", yesNo(data.role_account)],
        ["Free provider", yesNo(data.free_provider)],
        ...(data.canonical ? ([["Canonical", data.canonical]] as [string, string][]) : []),
        ...(data.suggestion ? ([["Did you mean", data.suggestion]] as [string, string][]) : []),
        ...(data.domain_age_days === null
          ? []
          : ([["Domain age", `${data.domain_age_days} days`]] as [string, string][])),
      ],
      data.degraded,
    );
    return 0;
  },
});

const checkIp: Command = defineCommand({
  name: "risk check ip",
  summary: "Check an IP: Tor, cloud, VPN, its network and country",
  usage: "<ip>",
  description:
    "Checks an IP address on its own: Tor, cloud, hosting and VPN networks, ASN and country, and " +
    "VPN, proxy and relay exits when that data is available. Nothing is stored.",
  flags: CHECK_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof CHECK_FLAGS>) => {
    const [ip] = requireArgs(positionals, 1, "risk check ip <ip>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.risk.checkIp(ip);
    if (error) throw apiError("Couldn't check the IP address", error);
    const { out } = context;
    if (out.json) {
      out.data(data);
      return 0;
    }
    out.line(data.ip);
    printFacts(
      out,
      [
        ["Tor", yesNo(data.tor)],
        ["Hosting", data.hosting ? (data.hosting_provider ?? data.hosting_kind ?? "yes") : "no"],
        ["Private", yesNo(data.private)],
        ...(data.asn === null
          ? []
          : ([["Network", `AS${data.asn}${data.as_name ? ` ${data.as_name}` : ""}`]] as [
              string,
              string,
            ][])),
        ...(data.country ? ([["Country", data.country]] as [string, string][]) : []),
        ...(data.privacy
          ? ([
              ["VPN", yesNo(data.privacy.vpn)],
              ["Proxy", yesNo(data.privacy.proxy)],
              ["Relay", yesNo(data.privacy.relay)],
            ] as [string, string][])
          : []),
      ],
      data.degraded,
    );
    return 0;
  },
});

const checkPhone: Command = defineCommand({
  name: "risk check phone",
  summary: "Check a number: line type, carrier, SIM swaps (billed when live)",
  usage: "<number>",
  description:
    "Checks a phone number in E.164 form on its own: whether it exists, its line type and carrier, " +
    "and a recent SIM swap where carriers share it. Nothing is stored. Live checks that get an " +
    "answer are billed, so this is never retried.",
  flags: CHECK_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof CHECK_FLAGS>) => {
    const [phone] = requireArgs(positionals, 1, "risk check phone <number>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.risk.checkPhone(phone);
    if (error) throw apiError("Couldn't check the number", error);
    const { out } = context;
    if (out.json) {
      out.data(data);
      return 0;
    }
    out.line(data.phone);
    printFacts(
      out,
      [
        ["Valid", yesNo(data.valid)],
        ...(data.country ? ([["Country", data.country]] as [string, string][]) : []),
        ...(data.line_type ? ([["Line type", data.line_type]] as [string, string][]) : []),
        ...(data.carrier?.name ? ([["Carrier", data.carrier.name]] as [string, string][]) : []),
        ...(data.sim_swap
          ? ([["Recent SIM swap", yesNo(data.sim_swap.recent)]] as [string, string][])
          : []),
      ],
      data.degraded,
    );
    return 0;
  },
});

const CLASSIFY_FLAGS = {
  file: { type: "string", value: "<path>", description: "Classify this file's text" },
  json: { type: "boolean", description: "Print the scores as JSON" },
} as const satisfies Flags;

const classify: Command = defineCommand({
  name: "risk classify",
  summary: "Score text for spam, phishing, malware and fraud",
  usage: "<text> | --file <path> | -",
  description:
    "Scores text for spam, phishing, malware and fraud: scores only, you choose the thresholds. " +
    "The text is neither stored nor logged. Sandbox keys score from markers: [coss-test:spam] " +
    "(or phishing, malware, fraud; [coss-test:spam:0.6] for a score). - reads stdin.",
  flags: CLASSIFY_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof CLASSIFY_FLAGS>) => {
    const { io, out } = context;
    if (values.file !== undefined ? positionals.length > 0 : positionals.length !== 1) {
      throw new UsageError("Usage: coss risk classify <text> | --file <path> | -");
    }
    const [given] = positionals as [string];
    const text =
      values.file !== undefined
        ? await fileText(context, "--file", values.file)
        : given === "-"
          ? await io.readStdin()
          : given;
    const coss = await client(context);
    const { data, error } = await coss.risk.classify({ text });
    if (error) throw apiError("Couldn't classify the text", error);
    if (out.json) {
      out.data(data);
      return 0;
    }
    const rows = Object.entries(data.scores).map(([name, score]) => [name, score.toFixed(2)]);
    for (const line of table(rows)) out.line(line);
    if (data.truncated) out.warn("Only its beginning counted: the model reads 8,000 characters.");
    return 0;
  },
});

// ── Settings ────────────────────────────────────────────────────────────────────────────────────

const CAPTCHA_PROVIDERS = ["turnstile", "hcaptcha"] as const;

function printSettings(out: Output, settings: RiskSettings): void {
  out.line(`Review at   ${settings.review_threshold}`);
  out.line(`Block at    ${settings.block_threshold}`);
  out.line(
    `Captcha     ${settings.captcha ? `${settings.captcha.provider}${settings.captcha.required ? ", required" : ""}` : "off"}`,
  );
  out.line(
    `Disabled    ${settings.disabled_reasons.length > 0 ? settings.disabled_reasons.join(", ") : "none"}`,
  );
  const content = Object.entries(settings.content_thresholds)
    .map(([name, value]) => `${name} ${value ?? "off"}`)
    .join(", ");
  out.line(`Content     ${content}`);
  const weights = Object.entries(settings.reason_weights);
  if (weights.length > 0) {
    out.line(`Weights     ${weights.map(([code, weight]) => `${code} ${weight}`).join(", ")}`);
  }
}

const SETTINGS_FLAGS = {
  json: { type: "boolean", description: "Print the settings as JSON" },
} as const satisfies Flags;

const settingsGet: Command = defineCommand({
  name: "risk settings get",
  summary: "Show the environment's Risk settings",
  description:
    "Shows the thresholds decisions use, the captcha provider (never its secret), disabled " +
    "reasons, content thresholds and reason weights.",
  flags: SETTINGS_FLAGS,
  run: async ({ context }: CommandInput<typeof SETTINGS_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.risk.settings.get();
    if (error) throw apiError("Couldn't read the settings", error);
    printOne(context.out, data, printSettings);
    return 0;
  },
});

const SETTINGS_SET_FLAGS = {
  "review-threshold": {
    type: "string",
    value: "<score>",
    description: "Scores at or above it are review",
  },
  "block-threshold": {
    type: "string",
    value: "<score>",
    description: "Scores at or above it are block",
  },
  "disabled-reason": {
    type: "string",
    multiple: true,
    value: "<code>",
    description: "Reasons that never fire, replacing the list (repeatable; none: empty it)",
  },
  captcha: {
    type: "string",
    value: "<provider>",
    choices: [...CAPTCHA_PROVIDERS, "off"],
    description: "turnstile, hcaptcha, or off (deletes the secret too)",
  },
  "captcha-secret-stdin": {
    type: "boolean",
    description:
      "Read the provider's secret from stdin (a terminal asks for it): needed when setting a " +
      "provider for the first time or changing it",
  },
  "captcha-required": {
    type: "boolean",
    description: "With --captcha: assessments without a token get captcha.missing",
  },
  "captcha-optional": { type: "boolean", description: "With --captcha: a token isn't required" },
  data: {
    type: "string",
    value: "<json>",
    description:
      "More of the request body (content_thresholds, reason_weights), as JSON: @file or - for " +
      "stdin, or inline when it holds no secret; the flags above win over it",
  },
  json: { type: "boolean", description: "Print the settings as JSON" },
} as const satisfies Flags;

const settingsSet: Command = defineCommand({
  name: "risk settings set",
  summary: "Change the environment's Risk settings",
  description:
    "Changes what is given; everything else keeps its value. The captcha provider's secret is " +
    "never a flag's value: command lines are visible to other local processes.",
  flags: SETTINGS_SET_FLAGS,
  run: async ({ values, context }: CommandInput<typeof SETTINGS_SET_FLAGS>) => {
    const captcha = oneOf("--captcha", values.captcha, [...CAPTCHA_PROVIDERS, "off"] as const);
    const required = eitherOf(values["captcha-required"], values["captcha-optional"], [
      "--captcha-required",
      "--captcha-optional",
    ]);
    const wantsSecret = values["captcha-secret-stdin"] === true;
    if (!captcha && (wantsSecret || required !== undefined)) {
      throw new UsageError("--captcha-secret-stdin and --captcha-required go with --captcha.");
    }
    if (captcha === "off" && (wantsSecret || required !== undefined)) {
      throw new UsageError("--captcha off takes no secret and no --captcha-required.");
    }
    if (wantsSecret && values.data === "-") {
      throw new UsageError(
        "Stdin can't hold both --data and the captcha secret: use --data @file.",
      );
    }
    const base = values.data === undefined ? {} : await jsonObject(context.io, values.data, "data");
    const inline = values.data !== undefined && !/^[@-]/.test(values.data);
    if (inline && (base.captcha as { secret?: unknown } | null | undefined)?.secret !== undefined) {
      throw new UsageError(
        "A secret never goes on the command line: use --data @file or --captcha-secret-stdin.",
      );
    }
    const review = numberOf("--review-threshold", values["review-threshold"]);
    const block = numberOf("--block-threshold", values["block-threshold"]);
    const disabled = values["disabled-reason"] && listOf(values["disabled-reason"]);
    const secret = wantsSecret
      ? await secretInput(context, "the captcha secret", "--captcha-secret-stdin")
      : undefined;
    const params = {
      ...base,
      ...(review !== undefined && { review_threshold: review }),
      ...(block !== undefined && { block_threshold: block }),
      ...(disabled && { disabled_reasons: disabled.filter((code) => code !== "none") }),
      ...(captcha === "off" && { captcha: null }),
      ...(captcha &&
        captcha !== "off" && {
          captcha: {
            provider: captcha,
            ...(secret !== undefined && { secret }),
            ...(required !== undefined && { required }),
          },
        }),
    } as UpdateRiskSettingsParams;
    if (Object.keys(params).length === 0) {
      throw new UsageError("Pass at least one setting to change (coss risk settings set --help).");
    }
    const coss = await client(context);
    const { data, error } = await coss.risk.settings.update(params);
    if (error) throw apiError("Couldn't change the settings", error);
    printOne(context.out, data, printSettings);
    return 0;
  },
});

export const RISK_MANAGE_COMMANDS: readonly Command[] = [
  checkEmail,
  checkIp,
  checkPhone,
  classify,
  rulesList,
  rulesGet,
  rulesCreate,
  rulesUpdate,
  rulesDelete,
  settingsGet,
  settingsSet,
];
