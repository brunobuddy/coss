/**
 * Calendar providers calling back: a host's consent returning, and notifications that a calendar
 * changed. No API key: the consent has a single-use state, and a push must carry the channel's
 * secret token. Outside `/v1` and the OpenAPI document, and never the JSON error envelope. A push
 * does no provider work here: it marks the calendar for the worker to read.
 */
import {
  type CalendarDeps,
  completeCalendarAuthorization,
  handleCalendarPush,
} from "@coss/scheduling";
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";

export const SCHEDULING_CALLBACK_PATH = "/scheduling";

const PAGE_TEXT = {
  connected: "Your calendar is connected. You can close this window.",
  denied: "Your calendar wasn't connected. You can close this window.",
  invalid: "This link has expired. Please start connecting your calendar again.",
  failed: "Your calendar couldn't be connected. Please try again.",
} as const;

export function createSchedulingCallbackRoutes(opts: { calendars: CalendarDeps }): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use(async (c, next) => {
    const decision = await c.var.rateLimiter.consume({
      buckets: ["scheduling.callbacks"],
      subject: c.var.clientIp ?? "unattributed",
    });
    if (!decision.allowed) return c.text("Too many requests.", 429);
    await next();
  });

  router.get("/oauth/:provider/callback", async (c) => {
    const provider = c.req.param("provider");
    const state = c.req.query("state");
    if ((provider !== "google" && provider !== "microsoft") || !state) {
      return c.text(PAGE_TEXT.invalid, 400);
    }
    let outcome: keyof typeof PAGE_TEXT = "failed";
    let returnUrl: string | null = null;
    try {
      const result = await completeCalendarAuthorization(
        {
          provider,
          state,
          code: c.req.query("code") ?? null,
          error: c.req.query("error") ?? null,
        },
        opts.calendars,
      );
      outcome = result.outcome;
      returnUrl = result.returnUrl;
    } catch (error) {
      console.error("Calendar consent failed", error);
    }
    if (returnUrl) {
      const url = new URL(returnUrl);
      url.searchParams.set("coss_calendar", outcome);
      return c.redirect(url.toString(), 302);
    }
    return c.text(PAGE_TEXT[outcome], outcome === "connected" ? 200 : 400);
  });

  router.post("/push/google", async (c) => {
    const channelId = c.req.header("x-goog-channel-id");
    if (!channelId) return c.body(null, 400);
    const outcome = await handleCalendarPush({
      channelId,
      token: c.req.header("x-goog-channel-token") ?? null,
    });
    // 2xx for an unknown channel too: a stale channel otherwise gets retried for a long time.
    return c.body(null, outcome === "invalid" ? 403 : 200);
  });

  router.post("/push/microsoft", async (c) => {
    // Graph proves the endpoint exists by asking for this token straight back.
    const validationToken = c.req.query("validationToken");
    if (validationToken) return c.text(validationToken, 200);
    const body = (await c.req.json().catch(() => null)) as {
      value?: { subscriptionId?: string; clientState?: string }[];
    } | null;
    for (const item of body?.value ?? []) {
      if (!item.subscriptionId) continue;
      await handleCalendarPush({
        channelId: item.subscriptionId,
        token: item.clientState ?? null,
      });
    }
    return c.body(null, 202);
  });

  return router;
}
