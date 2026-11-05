/** Builds Scheduling's dependencies from the environment. */
import { createHash } from "node:crypto";
import { type SecretsKeyRing, secretsKeyRing } from "@coss/webhooks";
import type { CalendarDeps } from "./calendar/connections.ts";
import { decodeSchedulingDataKeys } from "./env.ts";

const DEVELOPMENT_KEY = createHash("sha256").update("coss scheduling development key").digest();

/**
 * `null` in production without a key: Scheduling is off there (`scheduling_unavailable`) until it's
 * configured, so a deploy that predates it still starts. Never a throwaway key, which would make
 * every attendee stored with it unreadable.
 */
export function schedulingDataKeysFromEnv(env: {
  SCHEDULING_DATA_KEYS?: string | undefined;
  NODE_ENV?: string | undefined;
}): SecretsKeyRing | null {
  if (env.SCHEDULING_DATA_KEYS) {
    return secretsKeyRing(
      decodeSchedulingDataKeys(env.SCHEDULING_DATA_KEYS),
      "SCHEDULING_DATA_KEYS",
    );
  }
  if (env.NODE_ENV === "production") return null;
  return secretsKeyRing([DEVELOPMENT_KEY], "SCHEDULING_DATA_KEYS");
}

export function schedulingCalendarAppsFromEnv(env: {
  GOOGLE_CALENDAR_CLIENT_ID?: string | undefined;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string | undefined;
  MICROSOFT_CALENDAR_CLIENT_ID?: string | undefined;
  MICROSOFT_CALENDAR_CLIENT_SECRET?: string | undefined;
  ZOOM_CLIENT_ID?: string | undefined;
  ZOOM_CLIENT_SECRET?: string | undefined;
  ZOOM_WEBHOOK_SECRET_TOKEN?: string | undefined;
}): CalendarDeps["apps"] {
  const pair = (clientId: string | undefined, clientSecret: string | undefined) =>
    clientId && clientSecret ? { clientId, clientSecret } : null;
  const zoom = pair(env.ZOOM_CLIENT_ID, env.ZOOM_CLIENT_SECRET);
  return {
    zoom: zoom && { ...zoom, webhookSecret: env.ZOOM_WEBHOOK_SECRET_TOKEN ?? null },
    google: pair(env.GOOGLE_CALENDAR_CLIENT_ID, env.GOOGLE_CALENDAR_CLIENT_SECRET),
    microsoft: pair(env.MICROSOFT_CALENDAR_CLIENT_ID, env.MICROSOFT_CALENDAR_CLIENT_SECRET),
  };
}
