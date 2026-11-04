import { captureCheckIn, withIsolationScope } from "@sentry/bun";

const MINUTE = 60_000;
/** Sentry limits check-ins per monitor, and a loop every few seconds needs no finer signal. */
const MIN_CHECK_IN_MS = MINUTE;

type CheckIn = typeof captureCheckIn;

/** A monitor per loop: late by a few minutes is a restart, not an outage, and one miss isn't news. */
export function loopMonitorConfig(intervalMs: number) {
  const minutes = Math.ceil(Math.max(intervalMs, MIN_CHECK_IN_MS) / MINUTE);
  return {
    schedule: { type: "interval" as const, value: minutes, unit: "minute" as const },
    checkinMargin: Math.max(5, Math.ceil(minutes / 2)),
    maxRuntime: 60,
    failureIssueThreshold: 3,
    recoveryThreshold: 1,
  };
}

/** Monitoring must never affect the work: a failed check-in is dropped. Without a DSN it's a no-op. */
function safely<T>(report: () => T): T | undefined {
  try {
    return report();
  } catch {
    return undefined;
  }
}

/** A job run repeatedly with a pause between runs, until stopped. */
export type Loop = {
  readonly name: string;
  /** Stops scheduling new runs and resolves once the current run (if any) has finished. */
  stop(): Promise<void>;
};

/**
 * Runs `run` immediately, then again `intervalMs` after each run finishes (runs never overlap).
 * A run that finds a full batch of work (`run` returns true) is followed immediately by the next.
 * Errors are logged (and reported to Sentry, tagged with the loop) and the loop carries on. At most
 * once a minute a run also checks in with Sentry (monitor `worker-<name>`), which is what notices a
 * loop that hangs, keeps failing or stops, since none of those fail a health check.
 */
export function startLoop(options: {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
  checkIn?: CheckIn;
}): Loop {
  const checkIn = options.checkIn ?? captureCheckIn;
  const monitorSlug = `worker-${options.name}`;
  const monitorConfig = loopMonitorConfig(options.intervalMs);
  const checkInEveryMs = Math.max(options.intervalMs, MIN_CHECK_IN_MS);
  let lastCheckInAt = Number.NEGATIVE_INFINITY;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<void> = Promise.resolve();

  const tick = () => {
    current = (async () => {
      let busy = false;
      const startedAt = Date.now();
      const checkInId =
        startedAt - lastCheckInAt >= checkInEveryMs
          ? safely(() => checkIn({ monitorSlug, status: "in_progress" }, monitorConfig))
          : undefined;
      if (checkInId) lastCheckInAt = startedAt;
      let status: "ok" | "error" = "ok";
      // Each run gets its own scope: whatever it reports (here or in the packages' own
      // console.error calls) is tagged with the loop, and nothing leaks into the next run.
      await withIsolationScope(async (scope) => {
        scope.setTag("loop", options.name);
        try {
          busy = (await options.run()) === true;
        } catch (error) {
          status = "error";
          console.error(`[worker:${options.name}] run failed:`, error);
        }
      });
      if (checkInId) {
        safely(() =>
          checkIn({
            checkInId,
            monitorSlug,
            status,
            duration: (Date.now() - startedAt) / 1000,
          }),
        );
      }
      if (!stopped) timer = setTimeout(tick, busy ? 0 : options.intervalMs);
    })();
  };
  tick();

  return {
    name: options.name,
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await current;
    },
  };
}
