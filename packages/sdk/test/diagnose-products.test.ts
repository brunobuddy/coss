import { describe, expect, test } from "bun:test";
import {
  diagnoseFormSubmission,
  diagnoseHookDelivery,
  diagnoseSchedulingSlots,
  diagnoseSignRequest,
  diagnoseVerification,
  fetchFormSubmissionDiagnosis,
  fetchHookDeliveryDiagnosis,
  fetchSchedulingSlotsDiagnosis,
  fetchSignRequestDiagnosis,
  fetchSmsDiagnosis,
  fetchVerificationDiagnosis,
  PRODUCT_SDK_REFERENCES,
} from "../src/diagnose.ts";
import { Coss } from "../src/index.ts";
import {
  form,
  hookDelivery,
  hookEndpoint,
  NOW,
  schedulingEventType,
  schedulingHost,
  schedulingSchedule,
  signer,
  signRequest,
  sms,
  smsEvent,
  submission,
  VERIFY_SETTINGS,
  verification,
} from "./diagnose-fixtures.ts";

const list = (data: unknown[]) => ({ object: "list", data, has_more: false });
const NOT_FOUND = {
  error: { type: "not_found_error", code: "not_found", message: "Not found.", request_id: "req" },
};

/** A `Coss` answering `METHOD /path` from a table (404 otherwise), recording what it was asked. */
function fakeCoss(routes: Record<string, unknown>) {
  const asked: string[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const route = `${init?.method ?? "GET"} ${url.pathname}`;
    asked.push(route);
    return route in routes
      ? Response.json(routes[route])
      : Response.json(NOT_FOUND, { status: 404 });
  };
  return { coss: new Coss({ apiKey: "coss_live_x", fetch, maxRetries: 0 }), asked };
}

describe("diagnoseVerification", () => {
  test("blocked: the fraud guard's reasons, explained, with the allow list as a way out", () => {
    const diagnosis = diagnoseVerification({
      verification: verification({
        status: "blocked",
        sends: [],
        reasons: [{ code: "ip.tor" }, { code: "verify.prefix_velocity", value: 31 }],
      }),
      now: NOW,
    });
    expect(diagnosis.verdict).toBe("blocked");
    expect(diagnosis.summary).toContain("ip.tor, verify.prefix_velocity");
    expect(diagnosis.reasons[0]?.explanation).toContain("Tor");
    expect(diagnosis.reasons[1]).toMatchObject({ value: 31 });
    expect(diagnosis.next_steps[0]).toContain(PRODUCT_SDK_REFERENCES.add_risk_list_entry);
  });

  test("too many wrong codes, and each failure code's own explanation", () => {
    const failed = diagnoseVerification({
      verification: verification({
        status: "failed",
        attempts: 5,
        failure: { code: "max_attempts", message: "Too many wrong codes." },
      }),
      now: NOW,
    });
    expect(failed.verdict).toBe("too_many_attempts");
    expect(failed.attempts_left).toBe(0);
    expect(failed.failure?.explanation).toContain("wrong codes");
    const suppressed = diagnoseVerification({
      verification: verification({
        status: "failed",
        failure: { code: "recipient_suppressed", message: "Suppressed." },
      }),
      now: NOW,
    });
    expect(suppressed.verdict).toBe("send_failed");
    expect(suppressed.next_steps[0]).toContain(PRODUCT_SDK_REFERENCES.check_sms_suppression);
  });

  test("pending with an undelivered SMS gives that message's explanation and steps", () => {
    const failure = { code: "carrier_filtered", message: "Filtered." };
    const diagnosis = diagnoseVerification({
      verification: verification(),
      context: {
        settings: VERIFY_SETTINGS,
        senderNumber: {
          phone_number: "+14155550123",
          status: "active",
          registration_status: "approved",
          can_send: true,
        },
        sms: {
          sms: sms({ status: "undelivered", delivered_at: null, failure }),
          events: [smsEvent("sms.undelivered", { failure })],
        },
      },
      now: NOW,
    });
    expect(diagnosis.verdict).toBe("awaiting_code");
    expect(diagnosis.explanation).toContain("wasn't delivered");
    expect(diagnosis.latest_send?.kind).toBe("sms");
    expect(diagnosis.next_steps.join(" ")).toContain("carrier registration");
    expect(diagnosis.warnings).toEqual([]);
    // The body holds the code: a diagnosis never carries it.
    expect(JSON.stringify(diagnosis)).not.toContain("482913");
  });

  test("wrong codes so far say the latest code is the only one that works", () => {
    const diagnosis = diagnoseVerification({
      verification: verification({ attempts: 2 }),
      now: NOW,
    });
    expect(diagnosis.explanation).toContain("Only the latest code works");
    expect(diagnosis.attempts_left).toBe(3);
  });

  test("a live environment without a number is told about shared numbers", () => {
    const diagnosis = diagnoseVerification({
      verification: verification({
        sends: [
          {
            channel: "sms",
            route: "shared_number",
            sms_id: null,
            email_id: null,
            created_at: "2026-10-15T11:58:00.000Z",
          },
        ],
      }),
      context: { settings: { ...VERIFY_SETTINGS, sms_from: null } },
      now: NOW,
    });
    expect(diagnosis.warnings[0]).toContain("shared_sender_unavailable");
    expect(diagnosis.sends[0]?.route_explanation).toContain("coss.com's message");
    expect(diagnosis.explanation).toContain("shared numbers");
  });

  test("a sandbox says the code is zeros, at the configured length", () => {
    const diagnosis = diagnoseVerification({
      verification: verification({ sandbox: true }),
      context: { settings: { ...VERIFY_SETTINGS, code_length: 4 } },
      now: NOW,
    });
    expect(diagnosis.explanation).toContain("0000");
    expect(diagnosis.warnings).toEqual([]);
  });

  test("fetching reads the latest send's message, and survives what it can't read", async () => {
    const { coss, asked } = fakeCoss({
      "GET /v1/verifications/vrf_1": verification(),
      "GET /v1/sms/sms_01k7c8m4q2f3e9v6t5r1n0p8yz": sms(),
      "GET /v1/sms/sms_01k7c8m4q2f3e9v6t5r1n0p8yz/events": list([smsEvent("sms.delivered")]),
    });
    const { data } = await fetchVerificationDiagnosis(coss, "vrf_1", { now: NOW });
    expect(data?.latest_send).toMatchObject({ kind: "sms", diagnosis: { verdict: "delivered" } });
    expect(asked).toContain("GET /v1/verify/settings");
    const missing = await fetchVerificationDiagnosis(coss, "vrf_none", { now: NOW });
    expect(missing.error?.code).toBe("not_found");
  });
});

describe("diagnoseSignRequest", () => {
  test("a draft nobody was asked to sign, and one too late to send", () => {
    const draft = diagnoseSignRequest({
      request: signRequest({ status: "draft", sent_at: null }),
      now: NOW,
    });
    expect(draft.verdict).toBe("draft");
    expect(draft.signers[0]?.state).toBe("not_sent");
    expect(draft.next_steps[0]).toContain(PRODUCT_SDK_REFERENCES.send_sign_request);
    const lapsed = diagnoseSignRequest({
      request: signRequest({
        status: "draft",
        sent_at: null,
        expires_at: "2026-10-01T00:00:00.000Z",
      }),
      now: NOW,
    });
    expect(lapsed.explanation).toContain("invalid_expiry");
  });

  test("sequential order: whose turn it is, and who waits for whom", () => {
    const diagnosis = diagnoseSignRequest({
      request: signRequest({
        signing_order: "sequential",
        signers: [
          signer({
            id: "s2",
            name: "Grace",
            order: 2,
            status: "pending",
          }),
          signer({ id: "s1", name: "Ada", order: 1, status: "viewed", viewed_at: "t" }),
        ],
      }),
      context: { events: [] },
      now: NOW,
    });
    expect(diagnosis.verdict).toBe("awaiting_signers");
    expect(diagnosis.signers.map((s) => [s.name, s.state])).toEqual([
      ["Ada", "viewed"],
      ["Grace", "waiting_for_turn"],
    ]);
    expect(diagnosis.signers[1]?.explanation).toContain("Ada must sign first");
    expect(diagnosis.outstanding).toEqual(["Ada", "Grace"]);
    expect(diagnosis.next_steps.join(" ")).toContain(PRODUCT_SDK_REFERENCES.remind_sign_request);
  });

  test("an embedded signer needs a link; email signers are invited or waiting", () => {
    const diagnosis = diagnoseSignRequest({
      request: signRequest({
        sent_at: "2026-10-15T11:00:00.000Z",
        signers: [
          signer({
            id: "s1",
            delivery: "embedded",
            authentication: "customer_asserted",
            status: "pending",
          }),
          signer({ id: "s2", order: 2, status: "pending" }),
        ],
      }),
      now: NOW,
    });
    expect(diagnosis.signers.map((s) => s.state)).toEqual([
      "needs_signing_link",
      "invitation_pending",
    ]);
    const steps = diagnosis.next_steps.join(" ");
    expect(steps).toContain(PRODUCT_SDK_REFERENCES.create_sign_session);
    expect(steps).toContain("60 minutes ago");
  });

  test("declined keeps the signer's reason; completed without a seal is still sealing", () => {
    const declined = diagnoseSignRequest({
      request: signRequest({
        status: "declined",
        signers: [
          signer({ status: "declined", declined_at: "t", decline_reason: "Wrong address." }),
          signer({ id: "s2", name: "Grace", order: 2, status: "pending" }),
        ],
      }),
      now: NOW,
    });
    expect(declined.verdict).toBe("declined");
    expect(declined.summary).toContain("Ada");
    expect(declined.signers[0]?.decline_reason).toBe("Wrong address.");
    expect(declined.signers[1]?.state).toBe("closed");

    const signed = signer({ status: "signed", signed_at: "t" });
    const sealing = diagnoseSignRequest({
      request: signRequest({ status: "completed", signers: [signed] }),
      now: NOW,
    });
    expect(sealing.verdict).toBe("sealing");
    expect(sealing.next_steps[0]).toContain("sign_request.completed");
    const completed = diagnoseSignRequest({
      request: signRequest({
        status: "completed",
        signers: [signed],
        signed_document: { sha256: "abc", sealed_at: "2026-10-15T11:59:30.000Z" },
      }),
      now: NOW,
    });
    expect(completed.verdict).toBe("completed");
    expect(completed.next_steps[0]).toContain(PRODUCT_SDK_REFERENCES.download_signed_document);
  });

  test("warns about expiry and a suspended organization, and never about a deployment", () => {
    const diagnosis = diagnoseSignRequest({
      request: signRequest({
        expires_at: "2026-10-15T20:00:00.000Z",
        reminder_interval_days: null,
      }),
      context: { reputation: { status: "suspended", reason: "bounce_rate" } },
      now: NOW,
    });
    const warnings = diagnosis.warnings.join(" ");
    expect(warnings).toContain("less than a day");
    expect(warnings).toContain("No automatic reminders");
    expect(warnings).toContain("suspended");
    expect(JSON.stringify(diagnosis)).not.toContain("deployment");
  });

  test("fetching reads the audit trail without its addresses", async () => {
    const { coss } = fakeCoss({
      "GET /v1/sign/requests/sreq_1": signRequest(),
      "GET /v1/sign/requests/sreq_1/audit_trail": list([
        {
          object: "sign_event",
          id: "sevt_1",
          sequence: 1,
          type: "created",
          signer_id: null,
          actor: "api_key",
          ip_address: "203.0.113.7",
          user_agent: "curl",
          details: {},
          occurred_at: "2026-10-15T11:59:00.000Z",
          previous_hash: null,
          hash: "h",
        },
      ]),
    });
    const { data } = await fetchSignRequestDiagnosis(coss, "sreq_1", { now: NOW });
    expect(data?.timeline).toEqual([
      { at: "2026-10-15T11:59:00.000Z", type: "created", actor: "api_key", signer_id: null },
    ]);
    expect(JSON.stringify(data)).not.toContain("203.0.113.7");
  });
});

describe("diagnoseFormSubmission", () => {
  test("spam: delivered nowhere, though the submitter saw a success", () => {
    const diagnosis = diagnoseFormSubmission({
      submission: submission({
        status: "spam",
        spam_reason: "risk_block",
        accepted_at: null,
        risk: { assessment_id: "rass_1", decision: "block", score: 0.95 },
      }),
      context: { form: form() },
    });
    expect(diagnosis.verdict).toBe("spam");
    expect(diagnosis.summary).toContain("even though the submitter saw a success");
    expect(diagnosis.submitter_saw).toContain("exactly like an accepted submission");
    expect(diagnosis.destinations.webhooks).toContain("form.submission.flagged");
    expect(diagnosis.destinations.notifications).toContain("only emailed once it is accepted");
    expect(diagnosis.next_steps[0]).toContain(PRODUCT_SDK_REFERENCES.release_form_submission);
  });

  test("a honeypot catch sends no webhook; spam on a verifying form looks pending", () => {
    const diagnosis = diagnoseFormSubmission({
      submission: submission({
        status: "spam",
        spam_reason: "honeypot",
        risk: null,
        accepted_at: null,
      }),
      context: {
        form: form({
          submitter: { email_field: "email", verify: true, confirmation_from: "hi@acme.com" },
        }),
      },
    });
    expect(diagnosis.destinations.webhooks).toContain("None: honeypot");
    expect(diagnosis.explanation).toContain("without running Risk");
    expect(diagnosis.submitter_saw).toContain("check your email");
  });

  test("held waits for someone; pending waits for the submitter", () => {
    const held = diagnoseFormSubmission({
      submission: submission({ status: "held", spam_reason: "risk_review", accepted_at: null }),
      context: { form: form() },
    });
    expect(held.verdict).toBe("held");
    expect(held.explanation).toContain("`on_review` is `hold`");
    const pending = diagnoseFormSubmission({
      submission: submission({ status: "pending_confirmation", accepted_at: null }),
      context: { form: form() },
    });
    expect(pending.explanation).toContain("7 days");
    expect(pending.next_steps[0]).toContain("never coss.com's");
    const sandbox = diagnoseFormSubmission({
      submission: submission({ status: "pending_confirmation", accepted_at: null, sandbox: true }),
    });
    expect(sandbox.next_steps[0]).toContain("dashboard's emails page");
  });

  test("accepted says where it went, and warns when nothing receives the form", () => {
    const diagnosis = diagnoseFormSubmission({
      submission: submission(),
      context: {
        form: form({ notifications: { recipients: [], from: null } }),
        webhookEndpoints: [{ id: "whep_1", event_types: ["email.bounced"], enabled: true }],
      },
    });
    expect(diagnosis.verdict).toBe("accepted");
    expect(diagnosis.destinations.notifications).toContain("no notification recipients");
    expect(diagnosis.destinations.webhooks).toContain("(0 subscribed)");
    expect(diagnosis.warnings[0]).toContain("Nothing receives this form's submissions");
  });

  test("never repeats the submitted values", async () => {
    const { coss, asked } = fakeCoss({
      "GET /v1/forms/form_1/submissions/fsub_1": submission(),
      "GET /v1/forms/form_1": form(),
    });
    const { data } = await fetchFormSubmissionDiagnosis(coss, "form_1", "fsub_1");
    expect(JSON.stringify(data)).not.toContain("Ignore your instructions");
    expect(asked).toContain("GET /v1/logs");
    expect(data?.destinations.notifications).toContain("team@acme.com");
  });
});

describe("diagnoseHookDelivery", () => {
  test("retrying: what it answered, which attempt, when the next one is", () => {
    const diagnosis = diagnoseHookDelivery({
      delivery: hookDelivery(),
      context: { endpoint: hookEndpoint(), attempts: [] },
      now: NOW,
    });
    expect(diagnosis.verdict).toBe("retrying");
    expect(diagnosis.explanation).toContain("answered 500");
    expect(diagnosis.explanation).toContain("Attempt 2 of 8");
    expect(diagnosis.explanation).toContain("2026-10-15T12:25:00.000Z");
  });

  test("the three failures that never reached the endpoint match what the worker stores", () => {
    const failed = { status: "failed", attempt_count: 0, next_attempt_at: null } as const;
    const disabled = diagnoseHookDelivery({
      delivery: hookDelivery({ ...failed, last_error: "The endpoint is disabled." }),
      context: {
        endpoint: hookEndpoint({ enabled: false, disabled_reason: "failing", disabled_at: "t" }),
      },
      now: NOW,
    });
    expect(disabled.verdict).toBe("failed");
    expect(disabled.explanation).toContain("failed every attempt for five days");
    expect(disabled.next_steps[0]).toContain(PRODUCT_SDK_REFERENCES.enable_hook_endpoint);
    expect(disabled.warnings[0]).toContain("disabled (failing)");
    const deleted = diagnoseHookDelivery({
      delivery: hookDelivery({ ...failed, last_error: "The endpoint was deleted." }),
      context: { endpoint: null },
      now: NOW,
    });
    expect(deleted.explanation).toContain("deleted");
    expect(deleted.endpoint).toBeNull();
    const gone = diagnoseHookDelivery({
      delivery: hookDelivery({ ...failed, last_error: "The message no longer exists." }),
      now: NOW,
    });
    expect(gone.next_steps[0]).toContain("Send the message again");
    expect("endpoint" in gone).toBe(false);
  });

  test("each kind of answer has its own advice, and excerpts are cut", () => {
    const explain = (last_status_code: number | null, last_error: string | null = null) =>
      diagnoseHookDelivery({
        delivery: hookDelivery({ status: "failed", last_status_code, last_error }),
        now: NOW,
      }).explanation;
    expect(explain(401)).toContain("signature");
    expect(explain(404)).toContain("URL");
    expect(explain(302)).toContain("redirect");
    expect(explain(null, "timeout")).toContain("15 seconds");
    const long = diagnoseHookDelivery({
      delivery: hookDelivery(),
      context: {
        attempts: [
          {
            object: "hook_attempt",
            id: "hatt_1",
            delivery_id: "hdlv_1",
            endpoint_id: "hep_1",
            attempted_at: "t",
            status_code: 500,
            duration_ms: 12,
            error: null,
            response_excerpt: "x".repeat(1000),
          },
        ],
      },
      now: NOW,
    });
    expect(long.attempts[0]?.response_excerpt?.length).toBe(300);
  });

  test("overdue deliveries and a failing endpoint are called out", () => {
    const diagnosis = diagnoseHookDelivery({
      delivery: hookDelivery({ next_attempt_at: "2026-10-15T11:00:00.000Z" }),
      context: {
        endpoint: hookEndpoint({ failing_since: "2026-10-13T12:00:00.000Z" }),
      },
      now: NOW,
    });
    expect(diagnosis.next_steps.join(" ")).toContain("due for 60 minutes");
    expect(diagnosis.warnings[0]).toContain("(2 day(s))");
  });

  test("fetching tells a deleted endpoint from one it couldn't read", async () => {
    const { coss } = fakeCoss({
      "GET /v1/hooks/applications/happ_1/deliveries/hdlv_1": hookDelivery(),
      "GET /v1/hooks/applications/happ_1/deliveries/hdlv_1/attempts": list([]),
    });
    const { data } = await fetchHookDeliveryDiagnosis(coss, "happ_1", "hdlv_1", { now: NOW });
    expect(data?.endpoint).toBeNull();
    expect(data?.warnings).toContain("Its endpoint no longer exists.");
  });
});

describe("diagnoseSchedulingSlots", () => {
  const range = { start: "2026-10-16T00:00:00.000Z", end: "2026-10-17T00:00:00.000Z" };
  const codes = (input: Partial<Parameters<typeof diagnoseSchedulingSlots>[0]>) =>
    diagnoseSchedulingSlots({
      eventType: schedulingEventType(),
      range,
      slots: [],
      now: NOW,
      ...input,
    }).findings.map((finding) => finding.code);

  test("with slots there's nothing to find", () => {
    const diagnosis = diagnoseSchedulingSlots({
      eventType: schedulingEventType(),
      range,
      slots: [{ start: "2026-10-16T09:00:00.000Z", end: "2026-10-16T09:30:00.000Z", hosts: [] }],
      now: NOW,
    });
    expect(diagnosis.verdict).toBe("slots_available");
    expect(diagnosis.first_slot).toBe("2026-10-16T09:00:00.000Z");
    expect(diagnosis.findings).toEqual([]);
  });

  test("the event type: archived, notice, booking window", () => {
    expect(codes({ eventType: schedulingEventType({ status: "archived" }) })).toContain(
      "event_type_archived",
    );
    expect(
      codes({
        eventType: schedulingEventType({ min_notice_minutes: 3 * 24 * 60 }),
      }),
    ).toContain("inside_minimum_notice");
    expect(
      codes({
        eventType: schedulingEventType({ booking_window: { kind: "rolling", days: 0 } }),
      }),
    ).toContain("outside_booking_window");
    expect(
      codes({
        eventType: schedulingEventType({
          booking_window: { kind: "range", from: "2027-01-01", to: "2027-02-01" },
        }),
      }),
    ).toContain("outside_booking_window");
    expect(
      codes({ range: { start: "2026-10-01T00:00:00.000Z", end: "2026-10-02T00:00:00.000Z" } }),
    ).toContain("range_in_past");
  });

  test("hosts: none, none matching, disabled, no schedule, too short", () => {
    expect(codes({ hosts: [] })).toEqual(["no_hosts"]);
    expect(
      codes({
        eventType: schedulingEventType({
          kind: "pool",
          hosts: [],
          host_filter: { team: "sales" },
        }),
        hosts: [],
      }),
    ).toEqual(["filter_matches_nobody"]);
    expect(
      codes({ hosts: [{ host: schedulingHost({ status: "disabled" }), schedules: [] }] }),
    ).toContain("hosts_disabled");
    expect(codes({ hosts: [{ host: schedulingHost(), schedules: [] }] })).toContain("no_schedule");
    expect(
      codes({
        eventType: schedulingEventType({ duration_minutes: 60 }),
        hosts: [
          {
            host: schedulingHost(),
            schedules: [
              schedulingSchedule({ rules: [{ days: [1], start: "09:00", end: "09:30" }] }),
            ],
          },
        ],
      }),
    ).toContain("duration_longer_than_hours");
  });

  test("a calendar that needs reauthorizing hides a host, unless it keeps last known times", () => {
    const calendars = [
      {
        object: "scheduling.calendar_connection" as const,
        id: "scc_1",
        host: "shost_1",
        provider: "google" as const,
        account: "grace@example.com",
        status: "needs_reauth" as const,
        calendars: [],
        created_at: "t",
      },
    ];
    const hosts = [{ host: schedulingHost(), schedules: [schedulingSchedule()], calendars }];
    const hidden = diagnoseSchedulingSlots({
      eventType: schedulingEventType(),
      range,
      slots: [],
      hosts,
      now: NOW,
    });
    expect(hidden.findings[0]).toMatchObject({
      code: "calendar_needs_reauth",
      certainty: "certain",
    });
    expect(hidden.explanation).toContain("never reads as free");
    expect(hidden.next_steps[0]).toContain(PRODUCT_SDK_REFERENCES.authorize_scheduling_calendar);
    const lastKnown = diagnoseSchedulingSlots({
      eventType: schedulingEventType(),
      range,
      slots: [],
      hosts,
      settings: { calendar_failure_mode: "last_known" },
      now: NOW,
    });
    expect(lastKnown.findings[0]?.certainty).toBe("possible");
  });

  test("a Zoom connection never hides anyone, and a simulated one is never stale", () => {
    const connection = (provider: "zoom" | "simulated") => ({
      object: "scheduling.calendar_connection" as const,
      id: "scc_1",
      host: "shost_1",
      provider,
      account: "x",
      status: "needs_reauth" as const,
      calendars: [
        { id: "c", external_id: "e", read_busy: true, write_target: false, verified_at: null },
      ],
      created_at: "t",
    });
    expect(
      codes({
        hosts: [
          {
            host: schedulingHost(),
            schedules: [schedulingSchedule()],
            calendars: [connection("zoom"), connection("simulated")],
          },
        ],
      }),
    ).not.toContain("calendar_needs_reauth");
  });

  test("bookings, limits and busy calendars are only possibilities", () => {
    const diagnosis = diagnoseSchedulingSlots({
      eventType: schedulingEventType({
        buffer_after_minutes: 15,
        limits: [{ period: "day", max: 2, scope: "host" }],
      }),
      range,
      slots: [],
      hosts: [
        {
          host: schedulingHost(),
          schedules: [schedulingSchedule({ overrides: [{ date: "2026-10-16", ranges: [] }] })],
          calendars: [
            {
              object: "scheduling.calendar_connection",
              id: "scc_1",
              host: "shost_1",
              provider: "google",
              account: "g",
              status: "active",
              calendars: [
                {
                  id: "c",
                  external_id: "e",
                  read_busy: true,
                  write_target: true,
                  verified_at: NOW.toISOString(),
                },
              ],
              created_at: "t",
            },
          ],
          bookings: [{ id: "sbk_1", status: "confirmed" }],
        },
      ],
      now: NOW,
    });
    const byCode = new Map(diagnosis.findings.map((finding) => [finding.code, finding]));
    expect(byCode.get("days_off")?.certainty).toBe("likely");
    expect(byCode.get("bookings_in_range")?.certainty).toBe("possible");
    expect(byCode.get("bookings_in_range")?.explanation).toContain("15 after");
    expect(byCode.get("limits")?.certainty).toBe("possible");
    expect(byCode.get("calendar_busy")?.explanation).toContain("aren't readable");
    expect(byCode.has("calendar_needs_reauth")).toBe(false);
  });

  test("nothing in the range, but a next slot", () => {
    const diagnosis = diagnoseSchedulingSlots({
      eventType: schedulingEventType(),
      range,
      slots: [],
      nextSlot: "2026-10-20T09:00:00.000Z",
      hosts: [{ host: schedulingHost(), schedules: [schedulingSchedule()] }],
      now: NOW,
    });
    expect(diagnosis.next_slot).toBe("2026-10-20T09:00:00.000Z");
    expect(diagnosis.explanation).toContain("the next slot is 2026-10-20T09:00:00.000Z");
  });

  test("fetching stops at the first slot", async () => {
    const { coss, asked } = fakeCoss({
      "GET /v1/scheduling/event_types/set_1": schedulingEventType(),
      "GET /v1/scheduling/event_types/set_1/slots": list([
        { start: "2026-10-16T09:00:00.000Z", end: "2026-10-16T09:30:00.000Z", hosts: ["shost_1"] },
      ]),
    });
    const { data } = await fetchSchedulingSlotsDiagnosis(coss, "set_1", { now: NOW });
    expect(data?.verdict).toBe("slots_available");
    expect(asked).toEqual([
      "GET /v1/scheduling/event_types/set_1",
      "GET /v1/scheduling/event_types/set_1/slots",
    ]);
  });

  test("hosts that couldn't be read aren't taken for no hosts", async () => {
    const { coss } = fakeCoss({
      "GET /v1/scheduling/event_types/set_1": schedulingEventType(),
      "GET /v1/scheduling/event_types/set_1/slots": list([]),
    });
    const { data } = await fetchSchedulingSlotsDiagnosis(coss, "set_1", { now: NOW });
    expect(data?.verdict).toBe("no_slots");
    expect(data?.findings.map((finding) => finding.code)).not.toContain("no_hosts");
  });

  test("with no slots it reads the hosts' schedules, calendars and bookings", async () => {
    const { coss, asked } = fakeCoss({
      "GET /v1/scheduling/event_types/set_1": schedulingEventType(),
      "GET /v1/scheduling/event_types/set_1/slots": list([]),
      "GET /v1/scheduling/hosts/shost_1": schedulingHost(),
      "GET /v1/scheduling/hosts/shost_1/schedules": list([]),
      "GET /v1/scheduling/hosts/shost_1/calendar_connections": list([]),
      "GET /v1/scheduling/bookings": list([]),
    });
    const { data } = await fetchSchedulingSlotsDiagnosis(coss, "set_1", { now: NOW });
    expect(data?.findings[0]?.code).toBe("no_schedule");
    expect(asked).toContain("GET /v1/scheduling/bookings");
    expect(data?.hosts[0]).toMatchObject({ id: "shost_1", schedules: 0, bookings_in_range: 0 });
  });
});

describe("fetchSmsDiagnosis", () => {
  test("reads the message, its events and its context", async () => {
    const { coss, asked } = fakeCoss({
      "GET /v1/sms/sms_1": sms(),
      "GET /v1/sms/sms_1/events": list([smsEvent("sms.delivered")]),
    });
    const { data } = await fetchSmsDiagnosis(coss, "sms_1", { now: NOW });
    expect(data?.verdict).toBe("delivered");
    expect(asked).toContain("GET /v1/sms/numbers");
    const missing = await fetchSmsDiagnosis(coss, "sms_2", { now: NOW });
    expect(missing.error?.code).toBe("not_found");
  });
});
