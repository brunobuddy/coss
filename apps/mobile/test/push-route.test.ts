import { describe, expect, test } from "bun:test";
import { routeFromNotification } from "../src/lib/push-route";

describe("routeFromNotification", () => {
  test("opens the pages notifications point at", () => {
    for (const [path, route] of [
      ["/acme/reputation", "/acme/(organization)/reputation"],
      ["/acme/settings/billing", "/acme/(organization)/settings/billing"],
      [
        "/acme/settings/billing/invoices/inv_01k5f9",
        "/acme/(organization)/settings/billing/invoices/inv_01k5f9",
      ],
      ["/acme/spend", "/acme/(organization)/spend"],
    ]) {
      expect(routeFromNotification({ path })).toBe(route as string);
    }
    for (const path of [
      "/acme/projects/default/production/webhooks/whep_01k5f9",
      "/acme/projects/default/production/hooks/happ_1/endpoints/hep_1",
      "/acme/projects/default/production/log-drains/drain_1",
      "/acme/projects/default/production/risk",
    ]) {
      expect(routeFromNotification({ path })).toBe(path);
    }
  });

  test("ignores anything else", () => {
    for (const data of [
      null,
      undefined,
      {},
      { path: 42 },
      { path: "https://evil.example/acme/reputation" },
      { path: "//evil.example/reputation" },
      { path: "/acme/../reputation" },
      { path: "/acme/reputation?x=1" },
      { path: "/acme/settings/members" },
      { path: "/acme/spend/budgets" },
      { path: "/acme/projects/default/production/risk/rsk_1/feedback" },
    ]) {
      expect(routeFromNotification(data)).toBeNull();
    }
  });
});
