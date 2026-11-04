import { describe, expect, test } from "bun:test";
import { diagnoseSms, SMS_FAILURES } from "../src/diagnose-sms.ts";
import { NOW, sms, smsEvent } from "./diagnose-fixtures.ts";

const failure = (code: string) => ({ code, message: `${code} message` });

describe("diagnoseSms", () => {
  test("delivered: the carrier confirmed it", () => {
    const diagnosis = diagnoseSms({
      sms: sms(),
      events: [smsEvent("sms.sent"), smsEvent("sms.delivered")],
      now: NOW,
    });
    expect(diagnosis).toMatchObject({
      verdict: "delivered",
      summary: "Delivered to +15005550006.",
      failure: null,
      next_steps: [],
      warnings: [],
    });
    expect(diagnosis.details).toBeUndefined();
    expect(diagnosis.timeline.map((t) => t.type)).toEqual(["sms.sent", "sms.delivered"]);
  });

  test("undelivered: the failure code's meaning, the carrier's error code", () => {
    const diagnosis = diagnoseSms({
      sms: sms({ status: "undelivered", delivered_at: null, failure: failure("carrier_filtered") }),
      events: [
        smsEvent("sms.sent"),
        smsEvent("sms.undelivered", {
          failure: failure("carrier_filtered"),
          provider_error_code: "30007",
        }),
      ],
      now: NOW,
    });
    expect(diagnosis.verdict).toBe("not_delivered");
    expect(diagnosis.failure).toMatchObject({
      code: "carrier_filtered",
      explanation: expect.stringContaining("spam"),
    });
    expect(diagnosis.details).toEqual({ provider_error_code: "30007" });
    expect(diagnosis.timeline.at(-1)).toMatchObject({ failure_code: "carrier_filtered" });
  });

  test("the simulator's invalid and opted-out numbers leave no suppression to remove", () => {
    const simulated = diagnoseSms({
      sms: sms({
        to: "+15005550001",
        status: "failed",
        delivered_at: null,
        failure: failure("invalid_number"),
      }),
      events: [smsEvent("sms.failed", { failure: failure("invalid_number") })],
      now: NOW,
    });
    expect(simulated.failure?.explanation).toContain("never added to the suppression list");
    expect(simulated.next_steps.join(" ")).not.toContain("remove_sms_suppression");
    const real = diagnoseSms({
      sms: sms({
        to: "+14155550199",
        status: "failed",
        delivered_at: null,
        failure: failure("invalid_number"),
      }),
      events: [smsEvent("sms.failed", { failure: failure("invalid_number") })],
      now: NOW,
    });
    expect(real.failure?.explanation).toContain("suppression list (reason invalid_number)");
  });

  test("suppressed: names the matched entry and doesn't repeat it as a warning", () => {
    const entry = {
      object: "sms_suppression" as const,
      id: "smssup_1",
      phone_number: "+15005550009",
      reason: "opt_out" as const,
      sms_id: null,
      created_at: NOW.toISOString(),
    };
    const diagnosis = diagnoseSms({
      sms: sms({
        to: "+15005550009",
        status: "failed",
        sent_at: null,
        delivered_at: null,
        failure: failure("suppressed"),
      }),
      events: [smsEvent("sms.suppressed", { suppression: { id: "smssup_1", reason: "opt_out" } })],
      context: { suppression: entry },
      now: NOW,
    });
    expect(diagnosis.verdict).toBe("not_delivered");
    expect(diagnosis.details).toMatchObject({
      matched_suppression: { id: "smssup_1", reason: "opt_out" },
      suppression: { id: "smssup_1", reason: "opt_out" },
    });
    expect(diagnosis.next_steps.join(" ")).toContain("START");
    expect(diagnosis.warnings).toEqual([]);
  });

  test("sent long ago: no report yet is not a failure", () => {
    const diagnosis = diagnoseSms({
      sms: sms({ status: "sent", sent_at: "2026-10-15T11:30:00.000Z", delivered_at: null }),
      events: [smsEvent("sms.sent")],
      now: NOW,
    });
    expect(diagnosis.verdict).toBe("in_progress");
    expect(diagnosis.explanation).toContain("30 minute(s) ago");
    expect(diagnosis.next_steps[0]).toContain("never send one");
  });

  test("queued for long: explains the hold and the hour limit", () => {
    const diagnosis = diagnoseSms({
      sms: sms({
        status: "queued",
        created_at: "2026-10-15T11:40:00.000Z",
        sent_at: null,
        delivered_at: null,
      }),
      events: [],
      now: NOW,
    });
    expect(diagnosis.verdict).toBe("in_progress");
    expect(diagnosis.explanation).toContain("dispatch_failed");
  });

  test("account warnings: sandbox, unknown sender, a sender that can't send, holds", () => {
    expect(
      diagnoseSms({ sms: sms({ sandbox: true }), events: [], now: NOW }).warnings[0],
    ).toStartWith("Sandbox message");
    const unknown = diagnoseSms({ sms: sms(), events: [], context: { number: null }, now: NOW });
    expect(unknown.warnings[0]).toContain("sender_not_found");
    const scheduled = diagnoseSms({
      sms: sms({
        status: "scheduled",
        scheduled_at: "2026-10-16T09:00:00.000Z",
        sent_at: null,
        delivered_at: null,
      }),
      events: [],
      context: {
        number: {
          phone_number: "+14155550123",
          status: "active",
          registration_status: "submitted",
          can_send: false,
          receives_here: false,
        },
        reputation: { status: "suspended", reason: "sms_opt_out_rate" },
        billing: { status: "past_due", holds: [{ reason: "overdue_invoice", since: "x" }] },
      },
      now: NOW,
    });
    expect(scheduled.verdict).toBe("scheduled");
    expect(scheduled.next_steps[0]).toContain("fails when it is due");
    expect(scheduled.warnings).toHaveLength(3);
    expect(scheduled.warnings.join(" ")).toContain("registration submitted");
    expect(scheduled.warnings.join(" ")).toContain("sms_opt_out_rate");
    expect(scheduled.warnings.join(" ")).toContain("overdue_invoice");
  });

  test("an unknown code still gets an answer; every product code has advice", () => {
    const diagnosis = diagnoseSms({
      sms: sms({ status: "failed", failure: failure("something_new") }),
      events: [],
      now: NOW,
    });
    expect(diagnosis.failure?.explanation).toBe("The message could not be sent.");
    for (const code of [
      "invalid_number",
      "opted_out",
      "country_not_permitted",
      "unroutable",
      "unreachable",
      "blocked",
      "carrier_filtered",
      "sender_unregistered",
      "provider_error",
      "undelivered",
      "suppressed",
      "content_rejected",
      "content_screening_unavailable",
      "dispatch_failed",
      "dispatch_interrupted",
      "sender_unavailable",
      // Scheduled messages failing when due (`authorizeLiveSmsSender`).
      "account_suspended",
      "sender_not_found",
      "sender_not_ready",
      "country_not_allowed",
    ]) {
      expect(SMS_FAILURES[code]?.next_steps.length).toBeGreaterThan(0);
    }
  });
});
