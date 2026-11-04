/**
 * Why a Hooks delivery isn't succeeding: its attempts, what the endpoint answered, whether the
 * endpoint is disabled, and when it is retried next. `diagnoseHookDelivery` is pure (callers fetch,
 * it decides); `fetchHookDeliveryDiagnosis` fetches first.
 *
 * Must match Hooks' behaviour: `packages/hooks/src/deliver.ts` (`HOOK_RETRY_DELAYS_MS`, the messages
 * `failWithoutAttempt` stores, held organizations), `deliveries.ts` (`HOOK_MAX_ATTEMPTS`),
 * `@coss/webhooks/engine` (`endpointHealth`: disabled after five days of failing) and
 * `apps/site/content/docs/hooks/delivery.mdx`: change them together.
 */
import type { Coss } from "./client.ts";
import type { CossResult } from "./core/errors.ts";
import {
  minutesSince,
  type ProductDiagnosis,
  type ProductReferences,
  productReferences,
  softly,
} from "./diagnose-shared.ts";
import type { HookAttempt, HookDelivery, HookEndpoint } from "./types/hooks.ts";
import type { ReputationStatus } from "./types/reputation.ts";

export type HookDeliveryVerdict = "delivered" | "retrying" | "failed";

/** Attempts a delivery gets (`HOOK_MAX_ATTEMPTS`). */
const MAX_ATTEMPTS = 8;
/** Response excerpts in a diagnosis are cut to this many characters. */
const EXCERPT_LIMIT = 300;

export interface HookDeliveryDiagnosis extends ProductDiagnosis<HookDeliveryVerdict> {
  delivery_id: string;
  application_id: string;
  message_id: string;
  endpoint_id: string;
  status: HookDelivery["status"];
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  /** `null`: the endpoint no longer exists. Absent: it couldn't be read. */
  endpoint?: {
    url: string;
    enabled: boolean;
    disabled_reason: HookEndpoint["disabled_reason"];
    disabled_at: string | null;
    failing_since: string | null;
  } | null;
  /** Each HTTP request, oldest first. `response_excerpt` is the endpoint's own words: untrusted. */
  attempts: {
    attempted_at: string;
    status_code: number | null;
    duration_ms: number;
    error: string | null;
    response_excerpt: string | null;
  }[];
  created_at: string;
  finished_at: string | null;
}

export interface HookDeliveryDiagnosisContext {
  /** Its endpoint; `null` when it no longer exists. */
  endpoint?: HookEndpoint | null;
  /** Its attempts, oldest first. */
  attempts?: HookAttempt[];
  reputation?: { status: ReputationStatus; reason: string | null } | null;
}

/** What the endpoint's last answer usually means. */
function answerAdvice(delivery: HookDelivery): string {
  const code = delivery.last_status_code;
  if (code === null) {
    return `No response arrived${delivery.last_error ? ` (${delivery.last_error})` : ""}: the endpoint timed out or couldn't be reached. It must answer within 15 seconds (5 while it's failing); queue slow work and answer first.`;
  }
  if (code === 401 || code === 403) {
    return `It answered ${code}: usually the handler refusing the signature. Check that it verifies with this endpoint's own secret, and the raw body.`;
  }
  if (code === 404 || code === 410) {
    return `It answered ${code}: the URL is wrong or no longer exists.`;
  }
  if (code === 408 || code === 429) return `It answered ${code}: the receiver is overloaded.`;
  if (code >= 500) return `It answered ${code}: its handler is failing. Read its own logs.`;
  if (code >= 300 && code < 400) {
    return `It answered ${code}: a redirect isn't a success. Point the endpoint at the final URL.`;
  }
  return `It answered ${code}, and only a 2xx counts as delivered.`;
}

function adviceFor(
  delivery: HookDelivery,
  context: HookDeliveryDiagnosisContext,
  now: Date,
  ref: ProductReferences,
): { explanation: string; next_steps: string[] } {
  const { endpoint } = context;
  if (delivery.status === "succeeded") {
    return {
      explanation: `The endpoint answered ${delivery.last_status_code ?? "2xx"} after ${delivery.attempt_count} attempt(s). If the receiver says it never got it, the message's id is its \`webhook-id\` header.`,
      next_steps: [],
    };
  }
  if (delivery.status === "pending") {
    const steps = [`Each request's answer is in \`attempts\` (${ref.list_hook_attempts}).`];
    const due = delivery.next_attempt_at ? Date.parse(delivery.next_attempt_at) : null;
    const overdue = due !== null ? minutesSince(delivery.next_attempt_at as string, now) : 0;
    if (due !== null && due < now.getTime() && overdue >= 5) {
      steps.push(
        `It has been due for ${overdue} minutes: a suspended organization's deliveries wait, and so do deliveries over a rate limit. Check the account status (${ref.get_account_status}).`,
      );
    }
    return {
      explanation:
        delivery.attempt_count === 0
          ? "No attempt yet: it's waiting for the worker, or for a rate limit (which delays it without spending an attempt)."
          : `${answerAdvice(delivery)} Attempt ${delivery.attempt_count} of ${MAX_ATTEMPTS}; the next one is at ${delivery.next_attempt_at}.`,
      next_steps: steps,
    };
  }
  // Failed: `failWithoutAttempt`'s three reasons first.
  // These three stop a delivery without a request: earlier attempts may still have happened.
  const sent = delivery.attempt_count;
  const soFar = sent === 0 ? "" : ` after ${sent} attempt(s)`;
  if (delivery.last_error === "The endpoint is disabled.") {
    return {
      explanation:
        endpoint?.disabled_reason === "failing"
          ? `The endpoint was disabled because its deliveries failed every attempt for five days, so this delivery stopped${soFar}${sent === 0 ? " without being sent" : ""}.`
          : `The endpoint is disabled, so this delivery stopped${soFar}${sent === 0 ? " without being sent" : ""}.`,
      next_steps: [
        `Fix what it answers, then enable it (${ref.enable_hook_endpoint}). That clears its failing record.`,
        `Then retry this one (${ref.retry_hook_delivery}), or recover the deliveries that failed (${ref.recover_hook_endpoint}). Messages sent while it was disabled made no delivery, so recovery can't reach them: send those again.`,
      ],
    };
  }
  if (delivery.last_error === "The endpoint was deleted.") {
    return {
      explanation:
        sent === 0
          ? "The endpoint was deleted before this delivery was attempted."
          : `The endpoint was deleted before this delivery's next attempt${soFar}.`,
      next_steps: ["Nothing to retry: a delivery goes only to its own endpoint."],
    };
  }
  if (delivery.last_error === "The message no longer exists.") {
    return {
      explanation:
        sent === 0
          ? "The message's day of storage was dropped by retention before this delivery was attempted."
          : `The message's day of storage was dropped by retention before this delivery's next attempt${soFar}.`,
      next_steps: ["Send the message again."],
    };
  }
  return {
    explanation: `${answerAdvice(delivery)} Every one of its ${delivery.attempt_count} attempts failed, so coss.com stopped trying.`,
    next_steps: [
      `Fix the endpoint, then retry (${ref.retry_hook_delivery}), or recover every delivery that failed since then (${ref.recover_hook_endpoint}).`,
    ],
  };
}

function summarize(delivery: HookDelivery): string {
  switch (delivery.status) {
    case "succeeded":
      return `Delivered after ${delivery.attempt_count} attempt(s).`;
    case "pending":
      return delivery.next_attempt_at
        ? `Not delivered yet: ${delivery.attempt_count} attempt(s) so far, next at ${delivery.next_attempt_at}.`
        : `Not delivered yet: ${delivery.attempt_count} attempt(s) so far.`;
    case "failed":
      return `Failed for good after ${delivery.attempt_count} attempt(s)${delivery.last_status_code ? ` (last answer ${delivery.last_status_code})` : ""}.`;
  }
}

function warningsFor(
  context: HookDeliveryDiagnosisContext,
  now: Date,
  ref: ProductReferences,
): string[] {
  const { endpoint } = context;
  const warnings: string[] = [];
  if (endpoint === null) warnings.push("Its endpoint no longer exists.");
  if (endpoint && !endpoint.enabled) {
    warnings.push(
      `The endpoint is disabled (${endpoint.disabled_reason ?? "manual"}): new messages make no delivery for it, and what's pending fails at its next attempt (${ref.enable_hook_endpoint}).`,
    );
  }
  if (endpoint?.enabled && endpoint.failing_since) {
    const days = Math.floor(minutesSince(endpoint.failing_since, now) / (24 * 60));
    warnings.push(
      `The endpoint has been failing since ${endpoint.failing_since} (${days} day(s)): after five days coss.com disables it.`,
    );
  }
  if (context.reputation?.status === "suspended") {
    warnings.push(
      `The organization is suspended (${context.reputation.reason ?? "reputation"}): its deliveries wait until it is reinstated. See ${ref.get_account_status}.`,
    );
  }
  return warnings;
}

export function diagnoseHookDelivery(input: {
  delivery: HookDelivery;
  context?: HookDeliveryDiagnosisContext;
  now?: Date;
  references?: Partial<ProductReferences>;
}): HookDeliveryDiagnosis {
  const { delivery } = input;
  const context = input.context ?? {};
  const now = input.now ?? new Date();
  const ref = productReferences(input.references);
  const advice = adviceFor(delivery, context, now, ref);
  const { endpoint } = context;
  return {
    delivery_id: delivery.id,
    application_id: delivery.application_id,
    message_id: delivery.message_id,
    endpoint_id: delivery.endpoint_id,
    status: delivery.status,
    verdict:
      delivery.status === "succeeded"
        ? "delivered"
        : delivery.status === "pending"
          ? "retrying"
          : "failed",
    summary: summarize(delivery),
    explanation: advice.explanation,
    next_steps: advice.next_steps,
    warnings: warningsFor(context, now, ref),
    attempt_count: delivery.attempt_count,
    max_attempts: MAX_ATTEMPTS,
    next_attempt_at: delivery.next_attempt_at,
    last_status_code: delivery.last_status_code,
    last_error: delivery.last_error,
    ...(endpoint !== undefined
      ? {
          endpoint: endpoint && {
            url: endpoint.url,
            enabled: endpoint.enabled,
            disabled_reason: endpoint.disabled_reason,
            disabled_at: endpoint.disabled_at,
            failing_since: endpoint.failing_since,
          },
        }
      : {}),
    attempts: (context.attempts ?? []).map((attempt) => ({
      attempted_at: attempt.attempted_at,
      status_code: attempt.status_code,
      duration_ms: attempt.duration_ms,
      error: attempt.error,
      response_excerpt: attempt.response_excerpt
        ? attempt.response_excerpt.slice(0, EXCERPT_LIMIT)
        : null,
    })),
    created_at: delivery.created_at,
    finished_at: delivery.finished_at,
  };
}

/**
 * Reads a delivery, then best effort its attempts, endpoint and the organization's reputation.
 * Fails only when the delivery can't be read.
 */
export async function fetchHookDeliveryDiagnosis(
  coss: Coss,
  application: string,
  deliveryId: string,
  options: { signal?: AbortSignal; now?: Date; references?: Partial<ProductReferences> } = {},
): Promise<CossResult<HookDeliveryDiagnosis>> {
  const read = { signal: options.signal };
  const delivery = await coss.hooks.deliveries.get(application, deliveryId, read);
  if (delivery.error) return delivery;
  const [attempts, endpoint, reputation] = await Promise.all([
    softly(coss.hooks.deliveries.listAttempts(application, deliveryId, read)),
    coss.hooks.endpoints.get(application, delivery.data.endpoint_id, read),
    softly(coss.reputation.get(read)),
  ]);
  // A 404 is an answer (it was deleted); anything else leaves the endpoint unknown.
  const endpointKnown = endpoint.error ? endpoint.error.status === 404 : true;
  return {
    data: diagnoseHookDelivery({
      delivery: delivery.data,
      context: {
        ...(attempts ? { attempts: attempts.data } : {}),
        ...(endpointKnown ? { endpoint: endpoint.data } : {}),
        ...(reputation
          ? { reputation: { status: reputation.status, reason: reputation.reason } }
          : {}),
      },
      now: options.now,
      references: options.references,
    }),
    error: null,
  };
}
