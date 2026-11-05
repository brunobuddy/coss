import { captureCheckIn, withIsolationScope } from "@sentry/bun";

const MINUTE = 60_000;
/** A run this long is stuck: no loop's batch takes anywhere near it. */
export const STUCK_AFTER_MS = 60 * MINUTE;
const WATCH_INTERVAL_MINUTES = 5;
export const LOOPS_MONITOR_SLUG = "worker-loops";

type CheckIn = typeof captureCheckIn;

/** A job run repeatedly with a pause between runs, until stopped. */
export type Loop = {
  readonly name: string;
  /** Stops scheduling new runs and resolves once the current run (if any) has finished. */
  stop(): Promise<void>;
  /** Whether the current run has gone on for longer than any run should. */
  stuck(nowMs: number): boolean;
};

/**
 * Runs `run` immediately, then again `intervalMs` after each run finishes (runs never overlap).
 * A run that finds a full batch of work (`run` returns true) is followed immediately by the next.
 * Errors are logged (and reported to Sentry, tagged with the loop) and the loop carries on.
 */
export function startLoop(options: {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}): Loop {
  let stopped = false;
  let runStartedAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<void> = Promise.resolve();

  const tick = () => {
    current = (async () => {
      let busy = false;
      runStartedAt = Date.now();
      // Each run gets its own scope: whatever it reports (here or in the packages' own
      // console.error calls) is tagged with the loop, and nothing leaks into the next run.
      await withIsolationScope(async (scope) => {
        scope.setTag("loop", options.name);
        try {
          busy = (await options.run()) === true;
        } catch (error) {
          console.error(`[worker:${options.name}] run failed:`, error);
        }
      });
      runStartedAt = null;
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
    stuck: (nowMs) => runStartedAt !== null && nowMs - runStartedAt > STUCK_AFTER_MS,
  };
}

/**
 * One Sentry cron monitor for all of a worker's loops (Sentry bills per monitor, and there are over
 * 50 loops). No check-in means the process is gone; an error check-in names what's stuck. A loop
 * that keeps failing is already reported by each run's own error.
 */
export function watchLoops(loops: readonly Loop[], checkIn: CheckIn = captureCheckIn): Loop {
  return startLoop({
    name: "loop-watch",
    intervalMs: WATCH_INTERVAL_MINUTES * MINUTE,
    run: async () => {
      const stuck = loops.filter((loop) => loop.stuck(Date.now())).map((loop) => loop.name);
      if (stuck.length > 0) {
        console.error(`[worker] Loops stuck for over an hour: ${stuck.join(", ")}`);
      }
      try {
        checkIn(
          { monitorSlug: LOOPS_MONITOR_SLUG, status: stuck.length > 0 ? "error" : "ok" },
          {
            schedule: { type: "interval", value: WATCH_INTERVAL_MINUTES, unit: "minute" },
            checkinMargin: WATCH_INTERVAL_MINUTES,
            failureIssueThreshold: 2,
            recoveryThreshold: 1,
          },
        );
      } catch {
        // Monitoring must never affect the work.
      }
    },
  });
}
