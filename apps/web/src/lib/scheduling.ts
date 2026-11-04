import "server-only";
import { createHash } from "node:crypto";
import { hostedPageScreening } from "@coss/forms";
import type { SchedulingDeps } from "@coss/scheduling";
import { schedulingDataKeysFromEnv } from "@coss/scheduling/runtime";
import { env } from "@/env";
import { riskDeps } from "@/lib/risk";

/** Origin of the hosted pages sessions link to. */
export function schedulingUrl(): string | null {
  if (env.SCHEDULING_PUBLIC_URL) return env.SCHEDULING_PUBLIC_URL;
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3005";
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
    // The dashboard never looks attendees up by email; the key only has to exist.
    lookupKey: createHash("sha256").update("scheduling dashboard").digest(),
    publicUrl: schedulingUrl(),
    screenSetup: hostedPageScreening(riskDeps()),
  };
}
