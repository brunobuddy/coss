import { describe, expect, test } from "bun:test";
import { dashboardPath } from "../src/lib/dashboard-path";

describe("dashboardPath", () => {
  test("moves environment pages into their product", () => {
    expect(dashboardPath("/acme/projects/web/production")).toBe("/acme/web/production");
    expect(dashboardPath("/acme/projects/web/production/emails/email_1")).toBe(
      "/acme/web/production/email/messages/email_1",
    );
    expect(dashboardPath("/acme/projects/web/production/broadcasts/bcast_1")).toBe(
      "/acme/web/production/marketing/bcast_1",
    );
    expect(dashboardPath("/acme/projects/web/production/marketing")).toBe(
      "/acme/web/production/marketing/settings",
    );
    expect(dashboardPath("/acme/projects/web/production/log-drains/drain_1")).toBe(
      "/acme/web/production/developers/log-drains/drain_1",
    );
    expect(dashboardPath("/acme/projects/web/production/risk/lists")).toBe(
      "/acme/web/production/risk/lists",
    );
  });

  test("sends organization pages to settings or the remembered environment", () => {
    expect(dashboardPath("/acme/members")).toBe("/acme/settings/members");
    expect(dashboardPath("/acme/spend/budgets")).toBe("/acme/settings/spend/budgets");
    expect(dashboardPath("/acme/domains/dom_1/dmarc")).toBe(
      `/acme?to=${encodeURIComponent("/email/domains/dom_1/dmarc")}`,
    );
    expect(dashboardPath("/acme/sms/register?kind=us_10dlc")).toBe(
      `/acme?to=${encodeURIComponent("/sms/numbers/register?kind=us_10dlc")}`,
    );
    expect(dashboardPath("/acme/settings/sso")).toBe("/acme/settings/sso");
    expect(dashboardPath("/docs/data-retention")).toBe("/docs/data-retention");
  });
});
