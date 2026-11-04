import type { Verification } from "coss";
import { z } from "zod";
import { respond } from "../result.ts";
import {
  compact,
  cursorSchema,
  DESTRUCTIVE,
  given,
  limitSchema,
  nextCursor,
  READ_ONLY,
  SENDS,
  type ToolContext,
  WRITE,
} from "./shared.ts";

const STATUSES = ["pending", "approved", "expired", "canceled", "failed", "blocked"] as const;

function verificationSummary(verification: Verification): object {
  return compact({
    id: verification.id,
    channel: verification.channel,
    to: verification.to,
    country: verification.country,
    status: verification.status,
    failure: verification.failure,
    reasons: verification.reasons,
    attempts: verification.attempts,
    max_attempts: verification.max_attempts,
    routes: verification.sends.map((send) => send.route),
    sandbox: verification.sandbox || undefined,
    expires_at: verification.expires_at,
    approved_at: verification.approved_at,
    created_at: verification.created_at,
  });
}

export function registerVerifyTools(ctx: ToolContext): void {
  const { server, coss } = ctx;
  const id = z.string().describe("The verification's id (vrf_…). list_verifications finds it.");

  server.registerTool(
    "start_verification",
    {
      title: "Start a verification",
      description:
        "Sends a one-time code by SMS (to, in E.164 form) or email. Sandbox keys deliver nothing " +
        "and the code is always zeros. If it answers `shared_sender_unavailable`, name one of " +
        "your numbers with update_verify_settings.",
      inputSchema: z.object({
        to: z.string().describe("A mobile number in E.164 form, or an email address."),
        channel: z.enum(["sms", "email"]).optional().describe("Default: from what `to` is."),
        ip: z.string().optional().describe("The end user's IP address, for the fraud guard."),
        user_id: z.string().optional().describe("Your id for the end user."),
      }),
      annotations: SENDS,
    },
    (args) => respond(coss.verify.start(given(args)), verificationSummary),
  );

  server.registerTool(
    "check_verification",
    {
      title: "Check a code",
      description:
        "Compares the code the end user typed, by verification_id or by `to`. Only `valid: true` " +
        "proves they have the phone or mailbox; a wrong code spends an attempt.",
      inputSchema: z.object({
        verification_id: z.string().optional(),
        to: z.string().optional().describe("Checks this destination's latest verification."),
        code: z.string(),
      }),
      annotations: WRITE,
    },
    (args) =>
      respond(coss.verify.check(given(args)), (check) => ({
        valid: check.valid,
        verification: verificationSummary(check.verification),
      })),
  );

  server.registerTool(
    "list_verifications",
    {
      title: "List verifications",
      description:
        "Verifications, newest first. `blocked` ones list the fraud guard's reasons: that's why " +
        "no code went out.",
      inputSchema: z.object({
        to: z.string().optional(),
        status: z.enum(STATUSES).optional(),
        limit: limitSchema(20),
        cursor: cursorSchema,
      }),
      annotations: READ_ONLY,
    },
    ({ cursor, ...args }) =>
      respond(coss.verify.list(given({ ...args, after: cursor })), (page) => ({
        verifications: page.data.map(verificationSummary),
        next_cursor: nextCursor(page),
      })),
  );

  server.registerTool(
    "get_verification",
    {
      title: "Get a verification",
      description: "One verification with each send: its channel, route and message id.",
      inputSchema: z.object({ id }),
      annotations: READ_ONLY,
    },
    ({ id: verificationId }) => respond(coss.verify.get(verificationId)),
  );

  server.registerTool(
    "cancel_verification",
    {
      title: "Cancel a verification",
      description: "Cancels a pending verification: its code stops working.",
      inputSchema: z.object({ id }),
      annotations: DESTRUCTIVE,
    },
    ({ id: verificationId }) => respond(coss.verify.cancel(verificationId), verificationSummary),
  );

  server.registerTool(
    "get_verify_settings",
    {
      title: "Get the Verify settings",
      description:
        "The environment's name for codes, code length, lifetime and attempts, senders (`null`: " +
        "coss.com's) and the countries SMS codes may go to.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    () => respond(coss.verify.settings.get()),
  );

  server.registerTool(
    "update_verify_settings",
    {
      title: "Update the Verify settings",
      description:
        "Changes the fields given. sms_from must be one of the organization's numbers " +
        "(list_sms_numbers), and with a live key email_from must be on a verified domain.",
      inputSchema: z.object({
        app_name: z.string().nullable().optional().describe("`null`: the project's name."),
        code_length: z.number().int().min(4).max(10).optional(),
        ttl_seconds: z.number().int().optional(),
        max_attempts: z.number().int().optional(),
        sms_from: z.string().nullable().optional().describe("`null`: coss.com's shared numbers."),
        email_from: z.string().nullable().optional().describe("`null`: coss.com's sender."),
        allowed_countries: z
          .array(z.string())
          .optional()
          .describe("ISO 3166 codes, like US and GB. Allow only where your users are."),
      }),
      annotations: WRITE,
    },
    (args) => respond(coss.verify.settings.update(given(args))),
  );
}
