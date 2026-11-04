import "server-only";
import { hostedPageScreening } from "@coss/forms";
import { riskHashKeyFromEnv } from "@coss/risk/runtime";
import type { CalendarDeps, SchedulingDeps } from "@coss/scheduling";
import { schedulingDataKeysFromEnv } from "@coss/scheduling/runtime";
import { parseSecretsKeys } from "@coss/webhooks";
import { env } from "@/env";
import { planGate } from "@/lib/billing";
import { riskDeps } from "@/lib/risk";

/** Origin of the hosted pages sessions link to. */
export function schedulingUrl(): string | null {
  if (env.SCHEDULING_PUBLIC_URL) return env.SCHEDULING_PUBLIC_URL;
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3005";
}

/**
 * What a calendar delegation's setup needs here: its credentials and a try of one mailbox. Hosts are
 * connected by the worker, so no OAuth app or push address comes into it.
 */
export function schedulingCalendarDeps(): CalendarDeps {
  return {
    secretsKeys: parseSecretsKeys(env.WEBHOOK_SECRETS_KEY),
    apps: { google: null, microsoft: null },
    publicUrl: env.API_PUBLIC_URL,
  };
}

/** `null` until `SCHEDULING_DATA_KEYS` is set in production: its pages then don't exist. */
export function schedulingDeps(): SchedulingDeps | null {
  const dataKeys = schedulingDataKeysFromEnv({
    SCHEDULING_DATA_KEYS: env.SCHEDULING_DATA_KEYS,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (!dataKeys) return null;
  return {
    dataKeys,
    // The API's key: bookings' `email_hmac` is written with it, and the list searches by it.
    lookupKey: Buffer.from(riskHashKeyFromEnv(env)),
    publicUrl: schedulingUrl(),
    plans: planGate(),
    // Built when something is screened: most of these deps only read.
    screenSetup: (input) => hostedPageScreening(riskDeps())(input),
  };
}
