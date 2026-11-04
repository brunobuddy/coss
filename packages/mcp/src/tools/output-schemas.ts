/**
 * `outputSchema`s of `get_setup` and the diagnose tools, the only tools that declare one: clients
 * reject a result that doesn't match, so these promise only what the SDK always returns.
 *
 * Deliberately loose. Every object is a `looseObject` (a plain `z.object` becomes
 * `additionalProperties: false`, and an additive SDK field would fail in clients), and verdicts and
 * statuses are strings, not enums: `coss` is a caret range, so a newer SDK can add a verdict under
 * an older `coss-mcp`. `test/agent-surface.test.ts` and `apps/api/test/mcp-contract.test.ts` run
 * real results through a client, which validates them.
 */
import { z } from "zod";

const nullableString = z.string().nullable();

/** What every diagnosis has. */
const diagnosis = {
  verdict: z.string().describe("The outcome, in a word or two."),
  summary: z.string(),
  warnings: z.array(z.string()),
};

const productDiagnosis = {
  ...diagnosis,
  explanation: z.string(),
  next_steps: z.array(z.string()),
};

const failure = z.looseObject({
  code: z.string(),
  message: z.string(),
  explanation: z.string(),
  next_steps: z.array(z.string()),
});

export const SETUP_OUTPUT: z.ZodType = z.looseObject({
  mode: z.string().describe("`live`, `sandbox` or `unknown`."),
  from: nullableString.describe("A from address that will succeed, or null until one can send."),
  missing_dns: z.array(z.looseObject({ domain: z.string(), name: z.string() })),
  webhook_endpoints: z.array(z.looseObject({ id: z.string(), url: z.string() })),
  next: z.string().describe("The single thing to do now, for `product` when one was asked for."),
  products: z
    .record(
      z.string(),
      z.looseObject({
        status: z.string().describe("`ready`, `needs_setup` or `unknown`."),
        next: z.string(),
      }),
    )
    .describe("Readiness of email and of the product asked about."),
  product: z.string().optional(),
  products_in_use: z.array(z.string()).optional(),
  warning: z.string().optional(),
});

export const EMAIL_DIAGNOSIS_OUTPUT: z.ZodType = z.looseObject({
  ...diagnosis,
  email_id: z.string(),
  status: z.string(),
  sandbox: z.boolean(),
  failure: failure.nullable(),
  recipients: z.array(
    z.looseObject({
      address: z.string(),
      outcome: z.string(),
      explanation: z.string(),
      next_steps: z.array(z.string()),
    }),
  ),
});

export const SMS_DIAGNOSIS_OUTPUT: z.ZodType = z.looseObject({
  ...productDiagnosis,
  sms_id: z.string(),
  status: z.string(),
  sandbox: z.boolean(),
  failure: failure.nullable(),
});

export const VERIFICATION_DIAGNOSIS_OUTPUT: z.ZodType = z.looseObject({
  ...productDiagnosis,
  verification_id: z.string(),
  status: z.string(),
  sandbox: z.boolean(),
  failure: failure.nullable(),
  reasons: z.array(z.looseObject({ code: z.string(), explanation: z.string() })),
  attempts: z.number(),
  max_attempts: z.number(),
  sends: z.array(z.looseObject({ route: z.string(), route_explanation: z.string() })),
  latest_send: z.looseObject({ kind: z.string() }).nullable(),
});

export const SIGN_DIAGNOSIS_OUTPUT: z.ZodType = z.looseObject({
  ...productDiagnosis,
  sign_request_id: z.string(),
  status: z.string(),
  sandbox: z.boolean(),
  signers: z.array(
    z.looseObject({
      id: z.string(),
      state: z.string(),
      status: z.string(),
      explanation: z.string(),
    }),
  ),
  outstanding: z.array(z.string()),
});

export const FORM_DIAGNOSIS_OUTPUT: z.ZodType = z.looseObject({
  ...productDiagnosis,
  submission_id: z.string(),
  form_id: z.string(),
  status: z.string(),
  sandbox: z.boolean(),
  submitter_saw: z.string(),
  destinations: z.looseObject({
    webhooks: z.string(),
    notifications: z.string(),
    contacts: z.string(),
  }),
});

export const HOOK_DIAGNOSIS_OUTPUT: z.ZodType = z.looseObject({
  ...productDiagnosis,
  delivery_id: z.string(),
  status: z.string(),
  attempt_count: z.number(),
  max_attempts: z.number(),
  next_attempt_at: nullableString,
  attempts: z.array(z.looseObject({ attempted_at: z.string() })),
});

export const SCHEDULING_DIAGNOSIS_OUTPUT: z.ZodType = z.looseObject({
  ...productDiagnosis,
  event_type: z.looseObject({ id: z.string(), title: z.string() }),
  range: z.looseObject({ start: z.string(), end: z.string() }),
  slot_count: z.number(),
  first_slot: nullableString,
  next_slot: nullableString,
  findings: z.array(
    z.looseObject({
      certainty: z.string(),
      code: z.string(),
      explanation: z.string(),
      next_steps: z.array(z.string()),
    }),
  ),
  hosts: z.array(z.looseObject({ id: z.string() })),
});
