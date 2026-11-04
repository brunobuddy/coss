import type { BucketName, RateLimitDecision } from "@coss/ratelimit";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { ApiError } from "../errors.ts";
import type { AppEnv } from "../types.ts";

/** Whole seconds, rounded up: a client waiting this long is never early. */
function seconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** `RateLimit-*` headers (IETF draft, as most APIs send them) for the request's own bucket. */
export function setRateLimitHeaders(c: Context<AppEnv>, decision: RateLimitDecision): void {
  if (decision.failedOpen) return;
  c.header("RateLimit-Limit", String(decision.limit));
  c.header("RateLimit-Remaining", String(decision.remaining));
  c.header("RateLimit-Reset", String(seconds(decision.resetMs)));
}

/** The 429 for a denied decision. `Retry-After` is omitted when retrying can never succeed. */
export function rateLimitError(
  decision: RateLimitDecision,
  error: { code: string; message: string },
): ApiError {
  const headers: Record<string, string> = {};
  if (decision.retryAfterMs !== null) {
    headers["Retry-After"] = String(Math.max(1, seconds(decision.retryAfterMs)));
  }
  return new ApiError(429, { type: "rate_limit_error", ...error }, headers);
}

/**
 * Scheduling's live slot lists and searches, per organization, at the plan's rate: what a booking
 * page or a marketplace's search costs. Sandbox environments keep only their key's own bucket.
 */
export async function limitSchedulingSlots(
  rateLimiter: AppEnv["Variables"]["rateLimiter"],
  env: { organizationId: string; mode: "live" | "sandbox" },
): Promise<void> {
  if (env.mode !== "live") return;
  const decision = await rateLimiter.consume({
    buckets: ["scheduling.slots.second"],
    subject: env.organizationId,
    organizationId: env.organizationId,
  });
  if (!decision.allowed) {
    throw rateLimitError(decision, {
      code: "scheduling_rate_limited",
      message:
        "Too many slot lists and searches for this organization. Retry after `Retry-After` " +
        "seconds; higher plans allow more.",
    });
  }
}

/**
 * Route-level middleware, after `requireApiKey`: counts the request against the key's bucket for
 * this route class (`api.read`, `api.write`, `api.send`), with the organization's overrides.
 */
export function rateLimit(bucket: BucketName) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { apiKeyId, organizationId } = c.var.auth;
    const decision = await c.var.rateLimiter.consume({
      buckets: [bucket],
      subject: apiKeyId,
      organizationId,
    });
    setRateLimitHeaders(c, decision);
    if (!decision.allowed) {
      throw rateLimitError(decision, {
        code: "rate_limited",
        message: "Too many requests with this API key. Retry after `Retry-After` seconds.",
      });
    }
    await next();
  });
}
