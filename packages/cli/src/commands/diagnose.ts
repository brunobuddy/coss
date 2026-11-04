/**
 * `coss sms|verify|sign|forms|hooks|scheduling diagnose`: the SDK's `coss/diagnose` for one thing,
 * printed. `emails diagnose` lives with the emails' other reads (`emails-read.ts`).
 */
import {
  fetchFormSubmissionDiagnosis,
  fetchHookDeliveryDiagnosis,
  fetchSchedulingSlotsDiagnosis,
  fetchSignRequestDiagnosis,
  fetchSmsDiagnosis,
  fetchVerificationDiagnosis,
  type ProductDiagnosis,
  type ProductReferences,
} from "coss/diagnose";
import { type Flags, requireArgs } from "../args.ts";
import { type Command, type CommandInput, defineCommand } from "../command.ts";
import type { Context } from "../context.ts";
import { printable } from "../emails/format.ts";
import { apiError, CliError, UsageError } from "../errors.ts";
import type { Output, Style } from "../output.ts";
import { CLI_REFERENCES } from "./emails-read.ts";
import { client } from "./list-output.ts";

/**
 * How next steps name the ways to look further: a command where the CLI has one, else `coss api`.
 * `packages/cli/test/diagnose.test.ts` checks every command named here exists.
 */
export const PRODUCT_REFERENCES: ProductReferences = {
  search_logs: "`coss logs tail --since 1d`",
  get_account_status: "`coss api reputation`",
  check_email_suppression: "`coss api suppressions -f address=<address>`",
  list_sms_numbers: "`coss sms numbers`",
  check_sms_suppression: "`coss sms suppressions list`",
  remove_sms_suppression: "`coss sms suppressions remove <suppression>`",
  start_verification: "`coss verify start <to>`",
  get_verify_settings: "`coss verify settings get`",
  update_verify_settings: "`coss verify settings set --sms-from <number>`",
  add_risk_list_entry: "`coss risk lists add allow <type> <value>`",
  send_sign_request: "`coss sign send <request>`",
  remind_sign_request: "`coss sign remind <request>`",
  create_sign_session: "`coss api -X POST sign/requests/<request>/signers/<signer>/sessions`",
  get_sign_audit_trail: "`coss sign audit <request>`",
  download_signed_document: "`coss sign download <request>`",
  create_sign_request: "`coss sign create`",
  release_form_submission: "`coss forms release <form> <submission>`",
  update_form: "`coss api -X PATCH forms/<form>`",
  find_emails: "`coss emails list --to <address>`",
  list_webhook_endpoints: "`coss webhooks list`",
  list_hook_attempts: "`coss hooks attempts <app> <delivery>`",
  retry_hook_delivery: "`coss hooks retry <app> <delivery>`",
  enable_hook_endpoint:
    "`coss api -X PATCH hooks/applications/<app>/endpoints/<endpoint> -F enabled=true`",
  recover_hook_endpoint:
    "`coss api -X POST hooks/applications/<app>/endpoints/<endpoint>/recover -f since=<time>`",
  save_scheduling_host: "`coss api -X PATCH scheduling/hosts/<host>`",
  save_scheduling_schedule: "`coss api -X POST scheduling/hosts/<host>/schedules`",
  save_scheduling_event_type: "`coss api -X PATCH scheduling/event_types/<event-type>`",
  list_scheduling_calendars: "`coss scheduling calendars <host>`",
  authorize_scheduling_calendar:
    "`coss api -X POST scheduling/hosts/<host>/calendar_connections/authorize`",
  list_scheduling_bookings: "`coss scheduling bookings`",
};

const VERDICT_STYLES: Record<string, Style> = {
  delivered: "green",
  approved: "green",
  completed: "green",
  accepted: "green",
  slots_available: "green",
  in_progress: "yellow",
  retrying: "yellow",
  awaiting_code: "yellow",
  awaiting_signers: "yellow",
  sealing: "yellow",
  pending_confirmation: "yellow",
  draft: "yellow",
  held: "yellow",
  scheduled: "yellow",
  canceled: "dim",
};

function detail(out: Output, indent: string, label: string, value: string | null | undefined) {
  if (value) out.line(`${indent}${out.style("dim", `${label}:`)} ${printable(value)}`);
}

/** The head every diagnosis prints: the verdict, one line of ids, what it means. */
function printHead(out: Output, diagnosis: ProductDiagnosis, about: string): void {
  out.line(
    `${out.style(["bold", VERDICT_STYLES[diagnosis.verdict] ?? "red"], diagnosis.verdict.replaceAll("_", " "))}  ${printable(diagnosis.summary)}`,
  );
  out.line(out.style("dim", printable(about)));
  out.line();
  out.line(`  ${printable(diagnosis.explanation)}`);
}

/** The tail every diagnosis prints: what to do, and what else is wrong. */
function printTail(out: Output, diagnosis: ProductDiagnosis): void {
  for (const step of diagnosis.next_steps) out.line(`  ${out.style("cyan", "→")} ${step}`);
  if (diagnosis.warnings.length > 0) {
    out.line();
    for (const warning of diagnosis.warnings) out.line(`  ${out.style("yellow", "!")} ${warning}`);
  }
}

const JSON_FLAG = {
  json: { type: "boolean", description: "Print the diagnosis as JSON" },
} as const;

/** Prints a diagnosis with `--json`, or hands it to `print`. */
function answer<T>(context: Context, diagnosis: T, print: (out: Output, data: T) => void): number {
  const { out } = context;
  if (out.json) out.data(diagnosis);
  else print(out, diagnosis);
  return 0;
}

const SMS_FLAGS = {
  to: {
    type: "string",
    value: "<number>",
    description: "Diagnose the newest message to this number (E.164) instead of an id",
  },
  ...JSON_FLAG,
} as const satisfies Flags;

const sms: Command = defineCommand({
  name: "sms diagnose",
  summary: "Explain whether a text message was delivered, and why not",
  usage: "<message> | --to <number> [options]",
  description:
    "Explains what happened to a text message: a verdict, what its status or failure code means, " +
    "the carrier's error code, problems with the sender's registration, suppressions, reputation " +
    "or billing, and what to do next.",
  flags: SMS_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof SMS_FLAGS>) => {
    const { io } = context;
    const coss = await client(context);
    let id: string;
    if (values.to !== undefined) {
      if (positionals.length > 0) throw new UsageError("Pass a message id or --to, not both.");
      const { data, error } = await coss.sms.list(
        { to: values.to, limit: 1 },
        { signal: io.signal },
      );
      if (io.signal.aborted) return 130;
      if (error) throw apiError("Couldn't find the message", error);
      const newest = data.data[0];
      if (!newest) {
        throw new CliError(
          `No message to ${values.to} in this environment (sandbox and live messages are separate). A send the API refused never creates a message: \`coss logs tail --type api.request --status 4xx --since 1d\` shows refused requests.`,
        );
      }
      id = newest.id;
    } else {
      [id] = requireArgs(positionals, 1, "sms diagnose <message>") as [string];
    }
    const { data, error } = await fetchSmsDiagnosis(coss, id, {
      signal: io.signal,
      now: io.now(),
      references: PRODUCT_REFERENCES,
    });
    if (io.signal.aborted) return 130;
    if (error) throw apiError("Couldn't diagnose the message", error);
    return answer(context, data, (out, diagnosis) => {
      printHead(out, diagnosis, `${diagnosis.sms_id} · ${diagnosis.to} · ${diagnosis.created_at}`);
      if (diagnosis.failure) {
        detail(out, "  ", diagnosis.failure.code, diagnosis.failure.message);
      }
      if (diagnosis.details) detail(out, "  ", "details", JSON.stringify(diagnosis.details));
      printTail(out, diagnosis);
      if (diagnosis.timeline.length > 0) {
        out.line();
        for (const entry of diagnosis.timeline) {
          out.line(`  ${out.style("dim", entry.at)}  ${entry.type}`);
        }
      }
    });
  },
});

const VERIFY_FLAGS = {
  to: {
    type: "string",
    value: "<to>",
    description: "Diagnose the newest verification to this number or address instead of an id",
  },
  ...JSON_FLAG,
} as const satisfies Flags;

const verify: Command = defineCommand({
  name: "verify diagnose",
  summary: "Explain why a code didn't arrive, or why a check failed",
  usage: "<verification> | --to <to> [options]",
  description:
    "Explains a verification: a verdict, the fraud guard's reasons when it was blocked, expiry and " +
    "attempts, the route each code took, what happened to the latest code's message, problems with " +
    "the senders, and what to do next. It never shows a code.",
  flags: VERIFY_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof VERIFY_FLAGS>) => {
    const { io } = context;
    const coss = await client(context);
    let id: string;
    if (values.to !== undefined) {
      if (positionals.length > 0) throw new UsageError("Pass a verification id or --to, not both.");
      const { data, error } = await coss.verify.list(
        { to: values.to, limit: 1 },
        { signal: io.signal },
      );
      if (io.signal.aborted) return 130;
      if (error) throw apiError("Couldn't find the verification", error);
      const newest = data.data[0];
      if (!newest) {
        throw new CliError(
          `No verification to ${values.to} in this environment. A start the API refused (a country that isn't allowed, a quota) creates nothing: \`coss logs tail --type api.request --status 4xx --since 1d\` shows it.`,
        );
      }
      id = newest.id;
    } else {
      [id] = requireArgs(positionals, 1, "verify diagnose <verification>") as [string];
    }
    const { data, error } = await fetchVerificationDiagnosis(coss, id, {
      signal: io.signal,
      now: io.now(),
      references: PRODUCT_REFERENCES,
      emailReferences: CLI_REFERENCES,
    });
    if (io.signal.aborted) return 130;
    if (error) throw apiError("Couldn't diagnose the verification", error);
    return answer(context, data, (out, diagnosis) => {
      printHead(
        out,
        diagnosis,
        `${diagnosis.verification_id} · ${diagnosis.channel} · ${diagnosis.to} · ${diagnosis.attempts}/${diagnosis.max_attempts} attempts`,
      );
      for (const reason of diagnosis.reasons) {
        out.line(
          `  ${out.style("red", reason.code)}${reason.value === undefined ? "" : ` (${reason.value})`}: ${reason.explanation}`,
        );
      }
      for (const send of diagnosis.sends) {
        out.line(
          `  ${out.style("dim", send.created_at)}  ${send.route}  ${send.sms_id ?? send.email_id ?? ""}`,
        );
      }
      if (diagnosis.latest_send) {
        detail(out, "  ", "latest code", diagnosis.latest_send.diagnosis.summary);
      }
      printTail(out, diagnosis);
    });
  },
});

const SIGN_FLAGS = { ...JSON_FLAG } as const satisfies Flags;

const sign: Command = defineCommand({
  name: "sign diagnose",
  summary: "Explain where a signature request stands: who hasn't signed, and why",
  usage: "<request> [options]",
  description:
    "Explains a signature request: a verdict (a draft never sent, waiting, sealing, completed, " +
    "declined, expired, canceled), each signer's state and whose turn it is, and what to do next.",
  flags: SIGN_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof SIGN_FLAGS>) => {
    const { io } = context;
    const [id] = requireArgs(positionals, 1, "sign diagnose <request>") as [string];
    const coss = await client(context);
    const { data, error } = await fetchSignRequestDiagnosis(coss, id, {
      signal: io.signal,
      now: io.now(),
      references: PRODUCT_REFERENCES,
    });
    if (io.signal.aborted) return 130;
    if (error) throw apiError("Couldn't diagnose the request", error);
    return answer(context, data, (out, diagnosis) => {
      printHead(out, diagnosis, `${diagnosis.sign_request_id} · ${diagnosis.signing_order} order`);
      for (const signer of diagnosis.signers) {
        out.line();
        out.line(
          `  ${printable(signer.name)} <${printable(signer.email)}>  ${out.style(signer.state === "signed" ? "green" : signer.state === "declined" ? "red" : "yellow", signer.state.replaceAll("_", " "))}`,
        );
        out.line(`    ${printable(signer.explanation)}`);
        detail(out, "    ", "reason", signer.decline_reason);
      }
      out.line();
      printTail(out, diagnosis);
    });
  },
});

const FORMS_FLAGS = { ...JSON_FLAG } as const satisfies Flags;

const forms: Command = defineCommand({
  name: "forms diagnose",
  summary: "Explain what happened to a form submission",
  usage: "<form> [submission] [options]",
  description:
    "Explains a submission (the form's newest without an id): accepted and sent on, held by Risk, " +
    "marked spam and why, or waiting for the submitter to confirm; what the submitter saw, and " +
    "where it goes from here. Spam is answered exactly like a success, so a submitter who saw a " +
    "success proves nothing. The submitted values are left out (`coss forms submission` has them).",
  flags: FORMS_FLAGS,
  positionals: true,
  run: async ({ positionals, context }: CommandInput<typeof FORMS_FLAGS>) => {
    const { io } = context;
    const [formId, given, ...extra] = positionals;
    if (formId === undefined || extra.length > 0) {
      throw new UsageError("Usage: coss forms diagnose <form> [submission]");
    }
    const coss = await client(context);
    let id = given;
    if (id === undefined) {
      const { data, error } = await coss.forms.submissions.list(
        formId,
        { limit: 1 },
        { signal: io.signal },
      );
      if (io.signal.aborted) return 130;
      if (error) throw apiError("Couldn't find the submission", error);
      id = data.data[0]?.id;
      if (id === undefined) {
        throw new CliError(
          "This form has no submissions in this environment. A refused post (a disallowed origin, a failed captcha, a disabled form) creates nothing: `coss logs tail --source forms --since 1d` shows what arrived.",
        );
      }
    }
    const { data, error } = await fetchFormSubmissionDiagnosis(coss, formId, id, {
      signal: io.signal,
      references: PRODUCT_REFERENCES,
    });
    if (io.signal.aborted) return 130;
    if (error) throw apiError("Couldn't diagnose the submission", error);
    return answer(context, data, (out, diagnosis) => {
      printHead(out, diagnosis, `${diagnosis.submission_id} · ${diagnosis.created_at}`);
      detail(out, "  ", "submitter saw", diagnosis.submitter_saw);
      detail(out, "  ", "webhooks", diagnosis.destinations.webhooks);
      detail(out, "  ", "notifications", diagnosis.destinations.notifications);
      detail(out, "  ", "contacts", diagnosis.destinations.contacts);
      printTail(out, diagnosis);
    });
  },
});

const HOOKS_FLAGS = {
  message: {
    type: "string",
    value: "<message>",
    description: "Diagnose this message's worst delivery instead of an id",
  },
  endpoint: {
    type: "string",
    value: "<endpoint>",
    description: "Diagnose this endpoint's newest delivery that didn't succeed instead of an id",
  },
  ...JSON_FLAG,
} as const satisfies Flags;

const hooks: Command = defineCommand({
  name: "hooks diagnose",
  summary: "Explain why a Hooks delivery isn't succeeding",
  usage: "<app> [delivery] [--message <id> | --endpoint <id>] [options]",
  description:
    "Explains a delivery: a verdict, what the endpoint answered on each attempt, when the next " +
    "retry is, whether the endpoint is disabled or failing, and what to do next.",
  flags: HOOKS_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof HOOKS_FLAGS>) => {
    const { io } = context;
    const [application, given, ...extra] = positionals;
    const lookups = [given, values.message, values.endpoint].filter((v) => v !== undefined);
    if (application === undefined || extra.length > 0 || lookups.length !== 1) {
      throw new UsageError(
        "Usage: coss hooks diagnose <app> <delivery>, or <app> with --message or --endpoint.",
      );
    }
    const coss = await client(context);
    let id = given;
    if (id === undefined) {
      const { data, error } = values.message
        ? await coss.hooks.messages.listDeliveries(application, values.message, {
            signal: io.signal,
          })
        : await coss.hooks.endpoints.listDeliveries(
            application,
            values.endpoint as string,
            { limit: 20 },
            { signal: io.signal },
          );
      if (io.signal.aborted) return 130;
      if (error) throw apiError("Couldn't find the delivery", error);
      id = (
        data.data.find((delivery) => delivery.status === "failed") ??
        data.data.find((delivery) => delivery.status === "pending") ??
        data.data[0]
      )?.id;
      if (id === undefined) {
        throw new CliError(
          values.message
            ? "This message has no deliveries: when it was sent, no endpoint of the application was enabled and subscribed to its event type."
            : "This endpoint has no deliveries.",
        );
      }
    }
    const { data, error } = await fetchHookDeliveryDiagnosis(coss, application, id, {
      signal: io.signal,
      now: io.now(),
      references: PRODUCT_REFERENCES,
    });
    if (io.signal.aborted) return 130;
    if (error) throw apiError("Couldn't diagnose the delivery", error);
    return answer(context, data, (out, diagnosis) => {
      printHead(
        out,
        diagnosis,
        `${diagnosis.delivery_id} · ${diagnosis.endpoint?.url ?? diagnosis.endpoint_id} · ${diagnosis.attempt_count}/${diagnosis.max_attempts} attempts`,
      );
      for (const attempt of diagnosis.attempts) {
        out.line(
          `  ${out.style("dim", attempt.attempted_at)}  ${attempt.status_code ?? "no response"}  ${attempt.duration_ms} ms${attempt.error ? `  ${printable(attempt.error)}` : ""}`,
        );
        detail(out, "    ", "answered", attempt.response_excerpt);
      }
      printTail(out, diagnosis);
    });
  },
});

const SCHEDULING_FLAGS = {
  start: { type: "string", value: "<time>", description: "ISO 8601 (default: now)" },
  end: { type: "string", value: "<time>", description: "ISO 8601 (default: 7 days from now)" },
  host: { type: "string", value: "<host>", description: "Only this host (id or uid)" },
  ...JSON_FLAG,
} as const satisfies Flags;

const scheduling: Command = defineCommand({
  name: "scheduling diagnose",
  summary: "Explain why an event type has no bookable slots",
  usage: "<event-type> [options]",
  description:
    "Explains an empty slot list: each finding is certain, likely or possible (no host, a disabled " +
    "host, no schedule, a duration longer than the working hours, a calendar that needs " +
    "reauthorizing, minimum notice, the booking window, limits, bookings and buffers). A " +
    "calendar's busy times aren't readable through the API, so they can only be possible.",
  flags: SCHEDULING_FLAGS,
  positionals: true,
  run: async ({ values, positionals, context }: CommandInput<typeof SCHEDULING_FLAGS>) => {
    const { io } = context;
    const [eventType] = requireArgs(positionals, 1, "scheduling diagnose <event-type>") as [string];
    const coss = await client(context);
    const { data, error } = await fetchSchedulingSlotsDiagnosis(coss, eventType, {
      ...(values.start ? { start: values.start } : {}),
      ...(values.end ? { end: values.end } : {}),
      ...(values.host ? { host: values.host } : {}),
      signal: io.signal,
      now: io.now(),
      references: PRODUCT_REFERENCES,
    });
    if (io.signal.aborted) return 130;
    if (error) throw apiError("Couldn't diagnose the slots", error);
    return answer(context, data, (out, diagnosis) => {
      printHead(
        out,
        diagnosis,
        `${diagnosis.event_type.id} · ${diagnosis.range.start} to ${diagnosis.range.end}`,
      );
      for (const finding of diagnosis.findings) {
        out.line();
        out.line(`  ${out.style("bold", finding.code)}  ${out.style("dim", finding.certainty)}`);
        out.line(`    ${printable(finding.explanation)}`);
        for (const step of finding.next_steps) out.line(`    ${out.style("cyan", "→")} ${step}`);
      }
      if (diagnosis.warnings.length > 0) {
        out.line();
        for (const warning of diagnosis.warnings) {
          out.line(`  ${out.style("yellow", "!")} ${warning}`);
        }
      }
    });
  },
});

export const DIAGNOSE_COMMANDS: readonly Command[] = [sms, verify, sign, forms, hooks, scheduling];
