import { describe, expect, spyOn, test } from "bun:test";
import {
  LOOPS_MONITOR_SLUG,
  type Loop,
  STUCK_AFTER_MS,
  startLoop,
  watchLoops,
} from "../src/loop.ts";

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

  test("a run is stuck only once it has gone on for too long", async () => {
    let finish = () => {};
    const loop = startLoop({
      name: "slow",
      intervalMs: 60_000,
      run: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    expect(loop.stuck(Date.now())).toBe(false);
    expect(loop.stuck(Date.now() + STUCK_AFTER_MS + 1000)).toBe(true);
    finish();
    await loop.stop();
    expect(loop.stuck(Date.now() + STUCK_AFTER_MS + 1000)).toBe(false);
  });
});

describe("watchLoops", () => {
  const fake = (name: string, stuck: boolean): Loop => ({
    name,
    stop: async () => {},
    stuck: () => stuck,
  });

  test("checks in once on one monitor while every loop is healthy", async () => {
    const calls: { monitorSlug: string; status: string }[] = [];
    const watch = watchLoops([fake("a", false), fake("b", false)], ((checkIn: never) => {
      calls.push(checkIn);
      return "id";
    }) as never);
    await Bun.sleep(10);
    await watch.stop();
    expect(calls).toEqual([{ monitorSlug: LOOPS_MONITOR_SLUG, status: "ok" }]);
  });

  test("names what's stuck, and a failing check-in never affects the work", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});
    const statuses: string[] = [];
    const watch = watchLoops([fake("a", true), fake("b", false)], ((checkIn: {
      status: string;
    }) => {
      statuses.push(checkIn.status);
      throw new Error("Sentry is down");
    }) as never);
    await Bun.sleep(10);
    await watch.stop();
    expect(statuses).toEqual(["error"]);
    expect(errors).toHaveBeenCalledWith("[worker] Loops stuck for over an hour: a");
    errors.mockRestore();
  });
});
