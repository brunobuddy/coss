import { describe, expect, test } from "bun:test";
import {
  formatSupportTarget,
  PLAN_KEYS,
  SUPPORT_BUSINESS_DAY_MINUTES,
  supportResponseMinutes,
} from "@coss/billing/catalog";
import { parseSupportInline, parseSupportText } from "../src/format.ts";
import {
  bareAddress,
  displayNameOf,
  fromAddressCount,
  isAutomated,
  isDmarcAuthenticated,
  normalizeMessageId,
  supportRecipient,
} from "../src/sender.ts";
import { addBusinessMinutes, formatSupportTime, responseDueAt } from "../src/sla.ts";

const at = (iso: string) => new Date(iso);

describe("addBusinessMinutes", () => {
  // America/Chicago: CST is UTC-6, CDT is UTC-5. November 3, 2026 is a Tuesday.
  test("within a day", () => {
    expect(addBusinessMinutes(at("2026-11-03T16:00:00Z"), 60).toISOString()).toBe(
      "2026-11-03T17:00:00.000Z",
    );
  });

  test("before opening starts at opening", () => {
    // 6am Central; the day opens at 9am Central (15:00Z).
    expect(addBusinessMinutes(at("2026-11-03T12:00:00Z"), 30).toISOString()).toBe(
      "2026-11-03T15:30:00.000Z",
    );
  });

  test("carries overnight", () => {
    // 5pm Central with 2 hours to go: one today, one from 9am tomorrow.
    expect(addBusinessMinutes(at("2026-11-03T23:00:00Z"), 120).toISOString()).toBe(
      "2026-11-04T16:00:00.000Z",
    );
  });

  test("after closing starts the next day", () => {
    expect(addBusinessMinutes(at("2026-11-04T02:00:00Z"), 60).toISOString()).toBe(
      "2026-11-04T16:00:00.000Z",
    );
  });

  test("skips the weekend", () => {
    // Friday 5:30pm Central, an hour to go: 30 minutes Friday, 30 from Monday 9am.
    expect(addBusinessMinutes(at("2026-11-06T23:30:00Z"), 60).toISOString()).toBe(
      "2026-11-09T15:30:00.000Z",
    );
  });

  test("a weekend message waits for Monday", () => {
    expect(addBusinessMinutes(at("2026-11-07T18:00:00Z"), 60).toISOString()).toBe(
      "2026-11-09T16:00:00.000Z",
    );
  });

  test("across the fall daylight-saving change", () => {
    // Friday October 30 is CDT (9am is 14:00Z); Monday November 2 is CST (9am is 15:00Z).
    expect(addBusinessMinutes(at("2026-10-30T22:30:00Z"), 60).toISOString()).toBe(
      "2026-11-02T15:30:00.000Z",
    );
  });

  test("across the spring daylight-saving change", () => {
    // Friday March 6 is CST (6pm is 00:00Z); Monday March 9 is CDT (9am is 14:00Z).
    expect(addBusinessMinutes(at("2026-03-06T23:30:00Z"), 60).toISOString()).toBe(
      "2026-03-09T14:30:00.000Z",
    );
  });

  test("exactly at closing moves to the next day", () => {
    expect(addBusinessMinutes(at("2026-11-04T00:00:00Z"), 1).toISOString()).toBe(
      "2026-11-04T15:01:00.000Z",
    );
  });

  test("every plan and severity lands in support hours", () => {
    for (const plan of PLAN_KEYS) {
      for (const severity of ["normal", "urgent"] as const) {
        const due = addBusinessMinutes(
          at("2026-11-03T16:00:00Z"),
          supportResponseMinutes(plan, severity),
        );
        const hour = Number(
          new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Chicago",
            hour: "numeric",
            hourCycle: "h23",
          }).format(due),
        );
        expect(hour).toBeGreaterThanOrEqual(9);
        expect(hour).toBeLessThanOrEqual(18);
      }
    }
  });

  test("a business day is nine hours", () => {
    expect(SUPPORT_BUSINESS_DAY_MINUTES).toBe(540);
    expect(formatSupportTarget(540)).toBe("1 business day");
    expect(addBusinessMinutes(at("2026-11-03T16:00:00Z"), 540).toISOString()).toBe(
      "2026-11-04T16:00:00.000Z",
    );
  });
});

describe("responseDueAt", () => {
  test("an all-hours contract ignores support hours", () => {
    expect(
      responseDueAt({
        from: at("2026-11-07T18:00:00Z"),
        minutes: 60,
        allHours: true,
      }).toISOString(),
    ).toBe("2026-11-07T19:00:00.000Z");
  });

  test("otherwise it follows them", () => {
    expect(
      responseDueAt({
        from: at("2026-11-07T18:00:00Z"),
        minutes: 60,
        allHours: false,
      }).toISOString(),
    ).toBe("2026-11-09T16:00:00.000Z");
  });

  test("reads in Central Time", () => {
    expect(formatSupportTime(at("2026-11-03T20:00:00Z"))).toContain("2:00 PM CST");
  });
});

describe("parseSupportText", () => {
  test("paragraphs, lists and fenced code", () => {
    expect(
      parseSupportText(
        "Hello\nthere\n\n- one\n- two\n\n```\nconst a = 1;\n\n- not a list\n```\nDone",
      ),
    ).toEqual([
      { type: "paragraph", text: "Hello\nthere" },
      { type: "list", items: ["one", "two"] },
      { type: "code", text: "const a = 1;\n\n- not a list" },
      { type: "paragraph", text: "Done" },
    ]);
  });

  test("an unclosed fence keeps its text", () => {
    expect(parseSupportText("```\ncode")).toEqual([{ type: "code", text: "code" }]);
  });

  test("markup stays text", () => {
    expect(parseSupportText("<script>alert(1)</script>")).toEqual([
      { type: "paragraph", text: "<script>alert(1)</script>" },
    ]);
  });
});

describe("parseSupportInline", () => {
  test("code and links", () => {
    expect(parseSupportInline("See `coss.email` at https://coss.com/docs. Thanks")).toEqual([
      { type: "text", text: "See " },
      { type: "code", text: "coss.email" },
      { type: "text", text: " at " },
      { type: "link", url: "https://coss.com/docs" },
      { type: "text", text: ". Thanks" },
    ]);
  });

  test("only http links", () => {
    expect(parseSupportInline("javascript:alert(1)")).toEqual([
      { type: "text", text: "javascript:alert(1)" },
    ]);
  });
});

describe("sender", () => {
  test("addresses", () => {
    expect(bareAddress("Ada <ADA@Example.com>")).toBe("ada@example.com");
    expect(bareAddress("ada@example.com")).toBe("ada@example.com");
    expect(bareAddress("not an address")).toBeNull();
    expect(displayNameOf('"Ada L" <ada@example.com>')).toBe("Ada L");
    expect(displayNameOf("ada@example.com")).toBeNull();
  });

  test("support recipients", () => {
    expect(supportRecipient(["support@reply.coss.com"])).toEqual({
      address: "support@reply.coss.com",
      token: null,
    });
    expect(supportRecipient(["sales@reply.coss.com"])).toBeNull();
    expect(supportRecipient(["support@reply.coss.com", "support+abc@reply.coss.com"])).toEqual({
      address: "support+abc@reply.coss.com",
      token: "abc",
    });
  });

  test("only a DMARC pass on a single From counts", () => {
    const one = [{ name: "From", value: "Ada <ada@example.com>" }];
    const two = [{ name: "From", value: "ada@example.com, eve@evil.test" }];
    const twice = [...one, { name: "from", value: "eve@evil.test" }];
    const comma = [{ name: "From", value: '"Lovelace, Ada" <ada@example.com>' }];
    expect(isDmarcAuthenticated({ dmarcVerdict: "pass", headers: one })).toBe(true);
    expect(isDmarcAuthenticated({ dmarcVerdict: "pass", headers: comma })).toBe(true);
    expect(isDmarcAuthenticated({ dmarcVerdict: "gray", headers: one })).toBe(false);
    expect(isDmarcAuthenticated({ dmarcVerdict: "fail", headers: one })).toBe(false);
    expect(isDmarcAuthenticated({ dmarcVerdict: "pass", headers: two })).toBe(false);
    expect(isDmarcAuthenticated({ dmarcVerdict: "pass", headers: twice })).toBe(false);
    expect(isDmarcAuthenticated({ dmarcVerdict: "pass", headers: [] })).toBe(false);
    expect(fromAddressCount(two)).toBe(2);
  });

  test("automated mail", () => {
    const person = { mailFrom: "ada@example.com", from: "ada@example.com", headers: [] };
    expect(isAutomated(person)).toBe(false);
    expect(isAutomated({ ...person, mailFrom: "" })).toBe(true);
    expect(isAutomated({ ...person, from: "mailer-daemon@example.com" })).toBe(true);
    for (const [name, value] of [
      ["Auto-Submitted", "auto-replied"],
      ["Precedence", "bulk"],
      ["List-Id", "<x.example.com>"],
      ["X-Autoreply", "yes"],
    ] as const) {
      expect(isAutomated({ ...person, headers: [{ name, value }] })).toBe(true);
    }
    expect(isAutomated({ ...person, headers: [{ name: "Auto-Submitted", value: "no" }] })).toBe(
      false,
    );
  });

  test("message ids", () => {
    expect(normalizeMessageId("<a@b>")).toBe("<a@b>");
    expect(normalizeMessageId(" a@b ")).toBe("<a@b>");
    expect(normalizeMessageId("a b")).toBeNull();
    expect(normalizeMessageId(null)).toBeNull();
  });
});
