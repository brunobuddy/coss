/** `coss verify …`: one-time codes and the environment's Verify settings, on the public API. */
import type { UpdateVerifySettingsParams, Verification, VerificationStatus } from "coss";
import { type Flags, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import { apiError, UsageError } from "../errors.ts";
import type { Output, Style } from "../output.ts";
import { client, LIMIT, limitOf, oneOf, printList, when } from "./list-output.ts";

const STATUSES: readonly VerificationStatus[] = [
  "pending",
  "approved",
  "expired",
  "canceled",
  "failed",
  "blocked",
];
const CHANNELS = ["sms", "email"] as const;

function statusStyle(status: VerificationStatus): Style {
  if (status === "approved") return "green";
  return status === "pending" ? "yellow" : "red";
}

function printVerification(out: Output, verification: Verification): void {
  out.line(
    `${verification.id} ${out.style(statusStyle(verification.status), verification.status)} → ${verification.to}${verification.sandbox ? out.style("dim", " (sandbox)") : ""}`,
  );
  if (verification.failure) {
    out.line(`  ${verification.failure.code}: ${verification.failure.message}`);
  }
  for (const reason of verification.reasons) {
    out.line(`  ${reason.code}${reason.value === undefined ? "" : ` (${reason.value})`}`);
  }
}

const START_FLAGS = {
  channel: {
    type: "string",
    value: "<channel>",
    choices: CHANNELS,
    description: "sms or email (default: from what <to> is)",
  },
  ip: { type: "string", value: "<ip>", description: "The end user's IP, for the fraud guard" },
  user: { type: "string", value: "<id>", description: "Your id for the end user" },
  json: { type: "boolean", description: "Print the verification as JSON" },
} as const satisfies Flags;

const start: Command = defineCommand({
  name: "verify start",
  summary: "Send a one-time code by SMS or email",
  usage: "<to> [options]",
  description:
    "Sends a code to a mobile number in E.164 form or an email address. Sandbox keys deliver " +
    "nothing and the code is always zeros.",
  flags: START_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof START_FLAGS>) => {
    const [to] = requireArgs(positionals, 1, "verify start <to>") as [string];
    const channel = oneOf("--channel", values.channel, CHANNELS);
    const coss = await client(context);
    const { data, error } = await coss.verify.start({
      to,
      ...(channel && { channel }),
      ...(values.ip !== undefined && { ip: values.ip }),
      ...(values.user !== undefined && { user_id: values.user }),
    });
    if (error) throw apiError("Couldn't start the verification", error);
    const { out } = context;
    if (out.json) out.data(data);
    else {
      printVerification(out, data);
      if (data.sandbox) out.info(out.style("dim", "Sandbox: the code is all zeros."));
    }
    return 0;
  },
});

const CHECK_FLAGS = {
  code: { type: "string", value: "<code>", description: "The code the end user typed" },
  id: { type: "string", value: "<verification>", description: "Check this verification" },
  to: { type: "string", value: "<to>", description: "Check this destination's latest one" },
  json: { type: "boolean", description: "Print the answer as JSON" },
} as const satisfies Flags;

const check: Command = defineCommand({
  name: "verify check",
  summary: "Check a code; exits 1 when it's wrong",
  description:
    "Compares a code, by --id or --to. It exits 0 only when the code is right, and a wrong code " +
    "spends one of the verification's attempts.",
  flags: CHECK_FLAGS,
  run: async ({ values, context }: CommandInput<typeof CHECK_FLAGS>) => {
    if (!values.code) throw new UsageError("Pass --code <code>.");
    if (Boolean(values.id) === Boolean(values.to)) {
      throw new UsageError("Pass --id <verification> or --to <destination>, one of them.");
    }
    const coss = await client(context);
    const { data, error } = await coss.verify.check({
      code: values.code,
      ...(values.id ? { verification_id: values.id } : { to: values.to as string }),
    });
    if (error) throw apiError("Couldn't check the code", error);
    const { out } = context;
    if (out.json) out.data(data);
    else {
      out.line(data.valid ? out.style("green", "✔ Valid") : out.style("red", "✘ Not valid"));
      printVerification(out, data.verification);
    }
    return data.valid ? 0 : 1;
  },
});

const LIST_FLAGS = {
  to: { type: "string", value: "<to>", description: "Only this destination" },
  status: {
    type: "string",
    value: "<status>",
    choices: STATUSES,
    description: "pending, approved, expired, canceled, failed or blocked",
  },
  limit: LIMIT,
  json: { type: "boolean", description: "One verification per line, as JSON" },
} as const satisfies Flags;

const list: Command = defineCommand({
  name: "verify list",
  summary: "List verifications",
  description: "Lists verifications, newest first.",
  flags: LIST_FLAGS,
  run: async ({ values, context }: CommandInput<typeof LIST_FLAGS>) => {
    const status = oneOf("--status", values.status, STATUSES);
    const coss = await client(context);
    const { data, error } = await coss.verify.list({
      ...(values.to !== undefined && { to: values.to }),
      ...(status && { status }),
      ...(values.limit !== undefined && { limit: limitOf(values.limit) }),
    });
    if (error) throw apiError("Couldn't list the verifications", error);
    const { out } = context;
    printList(out, data.data, {
      empty: "No verifications.",
      header: ["ID", "STATUS", "CHANNEL", "TO", "CREATED"],
      row: (item) => [
        item.id,
        out.style(statusStyle(item.status), item.status),
        item.channel,
        item.to,
        when(item.created_at),
      ],
      more: data.has_more && "There are more: `coss api verifications --paginate` lists them all.",
    });
    return 0;
  },
});

const ONE_FLAGS = {
  json: { type: "boolean", description: "Print the verification as JSON" },
} as const satisfies Flags;

const get: Command = defineCommand({
  name: "verify get",
  summary: "Show a verification and each code it sent",
  usage: "<verification>",
  description: "Shows a verification: its status, the fraud guard's reasons and each send.",
  flags: ONE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof ONE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "verify get <verification>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.verify.get(id);
    if (error) throw apiError("Couldn't read the verification", error);
    const { out } = context;
    if (out.json) {
      out.data(data);
      return 0;
    }
    printVerification(out, data);
    for (const send of data.sends) {
      out.line(`  ${out.style("dim", when(send.created_at))}  ${send.channel} ${send.route}`);
    }
    return 0;
  },
});

const cancel: Command = defineCommand({
  name: "verify cancel",
  summary: "Cancel a pending verification: its code stops working",
  usage: "<verification>",
  description: "Cancels a pending verification, so its code stops working.",
  flags: ONE_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof ONE_FLAGS>) => {
    const [id] = requireArgs(positionals, 1, "verify cancel <verification>") as [string];
    const coss = await client(context);
    const { data, error } = await coss.verify.cancel(id);
    if (error) throw apiError("Couldn't cancel the verification", error);
    if (context.out.json) context.out.data(data);
    else printVerification(context.out, data);
    return 0;
  },
});

const SETTINGS_FLAGS = {
  json: { type: "boolean", description: "Print the settings as JSON" },
} as const satisfies Flags;

const settingsGet: Command = defineCommand({
  name: "verify settings get",
  summary: "Show the environment's Verify settings",
  description:
    "Shows the name codes are sent for, their length and lifetime, senders and countries.",
  flags: SETTINGS_FLAGS,
  run: async ({ context }: CommandInput<typeof SETTINGS_FLAGS>) => {
    const coss = await client(context);
    const { data, error } = await coss.verify.settings.get();
    if (error) throw apiError("Couldn't read the settings", error);
    printSettings(context.out, data);
    return 0;
  },
});

function printSettings(
  out: Output,
  settings: {
    app_name: string;
    code_length: number;
    ttl_seconds: number;
    max_attempts: number;
    sms_from: string | null;
    email_from: string | null;
    allowed_countries: string[];
  },
): void {
  if (out.json) {
    out.data(settings);
    return;
  }
  out.line(`App name    ${settings.app_name}`);
  out.line(
    `Codes       ${settings.code_length} digits, ${settings.ttl_seconds} s, ${settings.max_attempts} attempts`,
  );
  out.line(`SMS from    ${settings.sms_from ?? "coss.com's shared numbers"}`);
  out.line(`Email from  ${settings.email_from ?? "coss.com's sender"}`);
  out.line(`Countries   ${settings.allowed_countries.join(", ")}`);
}

function integerOf(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number)) throw new UsageError(`${flag} takes a whole number.`);
  return number;
}

/** `default` clears a setting that has a default of coss.com's. */
const orNull = (value: string): string | null => (value === "default" ? null : value);

const SET_FLAGS = {
  "app-name": {
    type: "string",
    value: "<name>",
    description: "The name codes are sent for (default: the project's)",
  },
  "code-length": { type: "string", value: "<n>", description: "Digits in a code" },
  ttl: { type: "string", value: "<seconds>", description: "How long a code works" },
  "max-attempts": { type: "string", value: "<n>", description: "Wrong codes before it fails" },
  "sms-from": {
    type: "string",
    value: "<number>",
    description: "One of your numbers (default: coss.com's)",
  },
  "email-from": {
    type: "string",
    value: "<address>",
    description: "An address on your verified domains (default: coss.com's)",
  },
  countries: {
    type: "string",
    value: "<codes>",
    description: "Countries SMS codes may go to: US,CA,GB",
  },
  json: { type: "boolean", description: "Print the settings as JSON" },
} as const satisfies Flags;

const settingsSet: Command = defineCommand({
  name: "verify settings set",
  summary: "Change the environment's Verify settings",
  description:
    "Changes the settings given; the word default goes back to coss.com's or the project's value.",
  flags: SET_FLAGS,
  run: async ({ values, context }: CommandInput<typeof SET_FLAGS>) => {
    const codeLength = integerOf("--code-length", values["code-length"]);
    const ttl = integerOf("--ttl", values.ttl);
    const maxAttempts = integerOf("--max-attempts", values["max-attempts"]);
    const params: UpdateVerifySettingsParams = {
      ...(values["app-name"] !== undefined && { app_name: orNull(values["app-name"]) }),
      ...(codeLength !== undefined && { code_length: codeLength }),
      ...(ttl !== undefined && { ttl_seconds: ttl }),
      ...(maxAttempts !== undefined && { max_attempts: maxAttempts }),
      ...(values["sms-from"] !== undefined && { sms_from: orNull(values["sms-from"]) }),
      ...(values["email-from"] !== undefined && { email_from: orNull(values["email-from"]) }),
      ...(values.countries !== undefined && {
        allowed_countries: values.countries
          .split(",")
          .map((country) => country.trim().toUpperCase())
          .filter(Boolean),
      }),
    };
    if (Object.keys(params).length === 0) {
      throw new UsageError(
        "Pass at least one setting to change (coss verify settings set --help).",
      );
    }
    const coss = await client(context);
    const { data, error } = await coss.verify.settings.update(params);
    if (error) throw apiError("Couldn't change the settings", error);
    printSettings(context.out, data);
    return 0;
  },
});

export const VERIFY_COMMANDS: readonly Command[] = [
  start,
  check,
  list,
  get,
  cancel,
  settingsGet,
  settingsSet,
];
