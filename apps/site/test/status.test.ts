import { describe, expect, test } from "bun:test";
import { cachedStatus, checkServices, type StatusReport } from "../src/lib/status";

const TARGETS = [
  { name: "API", description: "", url: "https://api.test/health" },
  { name: "Dashboard", description: "", url: "https://web.test/health" },
];
const now = () => new Date("2026-11-04T00:00:00Z");

describe("checkServices", () => {
  test("a service is up only if it answers with a success", async () => {
    const report = await checkServices(TARGETS, {
      now,
      fetch: async (url) => new Response(null, { status: url.includes("api") ? 200 : 503 }),
    });
    expect(report.checkedAt).toEqual(now());
    expect(report.services.map((service) => service.up)).toEqual([true, false]);
    expect(report.services[0]?.latencyMs).toBeNumber();
    expect(report.services[1]?.latencyMs).toBeNull();
  });

  test("an unreachable service is down, and never throws", async () => {
    const report = await checkServices(TARGETS, {
      now,
      fetch: async () => {
        throw new Error("connection refused");
      },
    });
    expect(report.services.map((service) => service.up)).toEqual([false, false]);
  });
});

describe("cachedStatus", () => {
  const report: StatusReport = { checkedAt: now(), services: [] };

  test("checks once per period, also for concurrent callers", async () => {
    let checks = 0;
    let time = 0;
    const status = cachedStatus(
      async () => {
        checks++;
        return report;
      },
      { cacheMs: 1_000, now: () => time },
    );
    await Promise.all([status(), status()]);
    time = 999;
    await status();
    expect(checks).toBe(1);
    time = 1_000;
    await status();
    expect(checks).toBe(2);
  });
});
