import type { PlanGate, UsageGate } from "@coss/billing/gate";
import type { SecretsKeyRing } from "@coss/webhooks";
import type { CalendarDeps } from "./calendar/connections.ts";
import type { SetupScreening } from "./screening.ts";

/** The environment everything happens in, from the API key or session. */
export type SchedulingEnvironment = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  mode: "live" | "sandbox";
};

export type SchedulingDeps = {
  /** Encrypts attendee contact details and answers (`SCHEDULING_DATA_KEYS`). */
  dataKeys: SecretsKeyRing;
  /** Keys the attendee email lookup (derived from `RISK_HASH_KEY`). */
  lookupKey: Buffer;
  /** Reserves capped plans' bookings (live only). */
  billing?: UsageGate | undefined;
  /** What the plan includes and allows (live only). */
  plans?: PlanGate | undefined;
  /** Calendars: a last look at the provider before booking. Without it, synced data alone. */
  calendars?: CalendarDeps | undefined;
  /** `SCHEDULING_PUBLIC_URL`: the hosted pages sessions link to. */
  publicUrl?: string | null | undefined;
  /** Screens text that lands in emails, when it's set up (live only). */
  screenSetup?: SetupScreening | undefined;
  /** Whether an address is on a domain the organization verified: `email`'s, injected. */
  verifiedAddress?:
    | ((input: { organizationId: string; address: string }) => Promise<boolean>)
    | undefined;
  /** The clock, for tests. */
  now?: () => Date;
};

export const nowOf = (deps: { now?: () => Date }): Date => deps.now?.() ?? new Date();

/** What the worker's loops need: nothing there looks attendees up by email. */
export type SchedulingWorkerDeps = Pick<SchedulingDeps, "dataKeys" | "calendars" | "now">;
