import { describe, expect, spyOn, test } from "bun:test";
import { loopMonitorConfig, startLoop } from "../src/loop.ts";

describe("startLoop", () => {
  test("runs immediately, repeats without overlapping, and stop waits for the current run", async () => {
    let running = 0;
    let maxRunning = 0;
    let runs = 0;
    let finished = 0;
    const loop = startLoop({
      name: "test",
      intervalMs: 5,
      run: async () => {
        runs++;
        running++;
        maxRunning = Math.max(maxRunning, running);
        await Bun.sleep(10);
        running--;
        finished++;
      },
    });
    expect(runs).toBe(1);
    await Bun.sleep(60);
    await loop.stop();
    const afterStop = runs;
    await Bun.sleep(30);

    expect(maxRunning).toBe(1);
    expect(runs).toBeGreaterThan(1);
    expect(runs).toBe(afterStop);
    expect(finished).toBe(runs);
  });

  test("keeps going after a failed run, and continues at once after a full batch", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    let runs = 0;
    const loop = startLoop({
      name: "test",
      intervalMs: 60_000,
      run: async () => {
        runs++;
        if (runs === 1) return true;
        if (runs === 2) throw new Error("boom");
        return false;
      },
    });
    await Bun.sleep(20);
    await loop.stop();
    // Run 2 followed run 1's full batch immediately; run 2's failure waits for the interval.
    expect(runs).toBe(2);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  test("checks in with Sentry around a run, at most once a minute", async () => {
    const calls: { status: string; monitorSlug: string; config: unknown }[] = [];
    const loop = startLoop({
      name: "monitored",
      intervalMs: 1,
      run: async () => {},
      checkIn: ((checkIn: { status: string; monitorSlug: string }, config?: unknown) => {
        calls.push({ status: checkIn.status, monitorSlug: checkIn.monitorSlug, config });
        return "id-1";
      }) as never,
    });
    await Bun.sleep(30);
    await loop.stop();
    expect(calls.map((call) => call.status)).toEqual(["in_progress", "ok"]);
    expect(calls[0]?.monitorSlug).toBe("worker-monitored");
    expect(calls[0]?.config).toEqual(loopMonitorConfig(1));
  });

  test("reports a failed run, and a failing check-in never affects the work", async () => {
    const statuses: string[] = [];
    const errors = spyOn(console, "error").mockImplementation(() => {});
    let runs = 0;
    const failing = startLoop({
      name: "failing",
      intervalMs: 60_000,
      run: async () => {
        throw new Error("boom");
      },
      checkIn: ((checkIn: { status: string }) => {
        statuses.push(checkIn.status);
        return "id-2";
      }) as never,
    });
    const unreachable = startLoop({
      name: "unreachable",
      intervalMs: 1,
      run: async () => {
        runs++;
      },
      checkIn: (() => {
        throw new Error("Sentry is down");
      }) as never,
    });
    await Bun.sleep(20);
    await failing.stop();
    await unreachable.stop();
    errors.mockRestore();
    expect(statuses).toEqual(["in_progress", "error"]);
    expect(runs).toBeGreaterThan(1);
  });

  test("a monitor's schedule follows the loop, never finer than a minute", () => {
    expect(loopMonitorConfig(5000).schedule.value).toBe(1);
    expect(loopMonitorConfig(60 * 60_000).schedule.value).toBe(60);
    expect(loopMonitorConfig(60 * 60_000).checkinMargin).toBe(30);
  });
});
