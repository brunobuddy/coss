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
  handleZoomDeauthorization,
  oauthAppCredentials,
  verifyZoomEvent,
  zoomOauthAppForEvents,
  zoomUrlValidation,
} from "@coss/scheduling";
import { type Context, Hono } from "hono";
import type { AppEnv } from "../types.ts";

export const SCHEDULING_CALLBACK_PATH = "/scheduling";

const PAGE_TEXT = {
  connected: "You're connected. You can close this window.",
  denied: "Nothing was connected. You can close this window.",
  invalid: "This link has expired. Please start connecting again.",
  failed: "That couldn't be connected. Please try again.",
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
    if ((provider !== "google" && provider !== "microsoft" && provider !== "zoom") || !state) {
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

  // Whichever app sent it, it only ever reaches that app's connections.
  const zoomEvent = async (c: Context<AppEnv>, secret: string, oauthAppId: string | null) => {
    const body = await c.req.text();
    const verified = verifyZoomEvent({
      secret,
      timestamp: c.req.header("x-zm-request-timestamp"),
      signature: c.req.header("x-zm-signature"),
      body,
      nowMs: Date.now(),
    });
    if (!verified) return c.body(null, 401);
    const event = JSON.parse(body) as {
      event?: string;
      payload?: { plainToken?: string; user_id?: string };
    };
    if (event.event === "endpoint.url_validation" && event.payload?.plainToken) {
      return c.json(zoomUrlValidation(event.payload.plainToken, secret));
    }
    if (event.event === "app_deauthorized" && event.payload?.user_id) {
      await handleZoomDeauthorization(event.payload.user_id, opts.calendars, oauthAppId);
    }
    return c.body(null, 200);
  };

  router.post("/zoom/events", async (c) => {
    const secret = opts.calendars.apps.zoom?.webhookSecret;
    if (!secret) return c.body(null, 404);
    return zoomEvent(c, secret, null);
  });

  // A customer's own Zoom app, with its own Secret Token: never coss.com's, or anyone else's.
  router.post("/zoom/events/:appId", async (c) => {
    const app = await zoomOauthAppForEvents(c.req.param("appId"));
    const secret = app && oauthAppCredentials(app, opts.calendars.secretsKeys).webhookSecret;
    if (!app || !secret) return c.body(null, 404);
    return zoomEvent(c, secret, app.id);
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
