import { describe, expect, test } from "bun:test";
import { type EventTypeObjectOutput, UpdateEventTypeRequest } from "@coss/scheduling/schemas";
import {
  eventTypeChanges,
  eventTypeFormState,
  eventTypePayload,
  formatAttributes,
  issueLabel,
  parseAttributes,
  parseKeyValues,
  questionKey,
} from "../src/lib/scheduling-edit";

const EVENT_TYPE: EventTypeObjectOutput = {
  object: "scheduling.event_type",
  id: "evtype_1",
  uid: "consult",
  title: "Consultation",
  kind: "pool",
  status: "active",
  duration_minutes: 30,
  duration_options: [15, 60],
  step_minutes: 15,
  grid_time_zone: "America/New_York",
  buffer_before_minutes: 5,
  buffer_after_minutes: 10,
  min_notice_minutes: 120,
  booking_window: { kind: "rolling", days: 60 },
  limits: [{ period: "day", max: 8, scope: "host" }],
  capacity: null,
  requires_approval: true,
  approval_ttl_minutes: 1440,
  hold_ttl_seconds: 600,
  cancel_notice_minutes: 60,
  reschedule_notice_minutes: 90,
  questions: [
    { key: "reason", type: "text", label: "Reason", required: true, options: [] },
    { key: "kind", type: "select", label: "Kind", required: false, options: ["New", "Follow-up"] },
  ],
  locations: [
    { type: "google_meet" },
    { type: "zoom", url: null },
    { type: "link", url: "https://meet.example.com/a" },
    { type: "phone", number: null },
    { type: "in_person", address: "1 Main St" },
  ],
  host_filter: { licensed_in: ["CA", "NY"] },
  hosts: [
    { host: "host_a", role: "required", weight: 100, schedule: null },
    { host: "host_b", role: "member", weight: 50, schedule: "sched_1" },
  ],
  metadata: { clinic: "north" },
  created_at: "2027-01-01T10:00:00.000Z",
  updated_at: "2027-01-01T10:00:00.000Z",
};

function submitted(eventType: EventTypeObjectOutput, edit?: (state: FormState) => void) {
  const state = eventTypeFormState(eventType);
  edit?.(state);
  return UpdateEventTypeRequest.parse({
    ...eventTypePayload(state, eventType.kind),
    metadata: eventType.metadata,
    host_filter: eventType.host_filter,
  });
}
type FormState = ReturnType<typeof eventTypeFormState>;

describe("the event type form", () => {
  test("saving it untouched changes nothing, so nothing is screened or locked", () => {
    expect(eventTypeChanges(EVENT_TYPE, submitted(EVENT_TYPE))).toEqual({});
  });

  test("a bare event type survives the round trip too", () => {
    const bare: EventTypeObjectOutput = {
      ...EVENT_TYPE,
      kind: "group",
      uid: null,
      capacity: 12,
      grid_time_zone: null,
      booking_window: null,
      duration_options: [],
      limits: [],
      questions: [],
      locations: [],
      host_filter: null,
      hosts: [],
      metadata: {},
    };
    expect(eventTypeChanges(bare, submitted(bare))).toEqual({});
  });

  test("only the field that changed is sent", () => {
    const changes = eventTypeChanges(
      EVENT_TYPE,
      submitted(EVENT_TYPE, (state) => {
        state.minNotice = "240";
      }),
    );
    expect(changes).toEqual({ min_notice_minutes: 240 });
  });

  test("the same hosts in another order aren't a change, but another weight is", () => {
    const reordered = submitted(EVENT_TYPE, (state) => {
      state.hosts.reverse();
    });
    expect(eventTypeChanges(EVENT_TYPE, reordered)).toEqual({});
    const reweighted = eventTypeChanges(
      EVENT_TYPE,
      submitted(EVENT_TYPE, (state) => {
        const row = state.hosts[1];
        if (row) row.weight = "75";
      }),
    );
    expect(reweighted.hosts?.map((host) => host.weight)).toEqual([100, 75]);
  });

  test("a question's order is a change, since attendees see that order", () => {
    const changes = eventTypeChanges(
      EVENT_TYPE,
      submitted(EVENT_TYPE, (state) => {
        state.questions.reverse();
      }),
    );
    expect(changes.questions?.map((question) => question.key)).toEqual(["kind", "reason"]);
  });

  test("options are dropped from a type that has none, and never carry blank lines", () => {
    const changes = eventTypeChanges(
      EVENT_TYPE,
      submitted(EVENT_TYPE, (state) => {
        const row = state.questions[1];
        if (row) row.options = "New\n\n  Follow-up  \n";
        const first = state.questions[0];
        if (first) {
          first.type = "text";
          first.options = "ignored";
        }
      }),
    );
    expect(changes).toEqual({});
  });

  test("emptied optional fields go back to none, and a window can be cleared", () => {
    const changes = eventTypeChanges(
      EVENT_TYPE,
      submitted(EVENT_TYPE, (state) => {
        state.uid = "  ";
        state.gridTimeZone = "";
        state.windowMode = "none";
      }),
    );
    expect(changes).toEqual({ uid: null, grid_time_zone: null, booking_window: null });
  });

  test("a date window is sent as dates", () => {
    const changes = eventTypeChanges(
      EVENT_TYPE,
      submitted(EVENT_TYPE, (state) => {
        state.windowMode = "range";
        state.windowFrom = "2027-02-01";
        state.windowTo = "2027-03-01";
      }),
    );
    expect(changes.booking_window).toEqual({
      kind: "range",
      from: "2027-02-01",
      to: "2027-03-01",
    });
  });

  test("a non-group event type never sends a capacity", () => {
    const payload = eventTypePayload(eventTypeFormState(EVENT_TYPE), "pool");
    expect(payload.capacity).toBeNull();
  });
});

describe("question keys", () => {
  test("come from the label, valid and unique", () => {
    expect(questionKey("What's your reason?", [])).toBe("what_s_your_reason");
    expect(questionKey("Reason", ["reason"])).toBe("reason_2");
    expect(questionKey("Reason", ["reason", "reason_2"])).toBe("reason_3");
    expect(questionKey("2nd opinion", [])).toBe("nd_opinion");
    expect(questionKey("???", [])).toBe("question");
    for (const label of ["2nd opinion", "???", "a".repeat(200), "Über uns"]) {
      expect(questionKey(label, [])).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
  });
});

describe("key=value text", () => {
  test("reads values with = in them, and blank lines", () => {
    expect(parseKeyValues("a=1\n\n b = x=y \n")).toEqual({ a: "1", b: "x=y" });
  });

  test("refuses a line it can't read, rather than dropping it", () => {
    expect(() => parseKeyValues("a=1\nnot a pair")).toThrow(/not a pair/);
    expect(() => parseKeyValues("=1")).toThrow();
  });

  test("attributes make lists from commas, and format back the same", () => {
    const attributes = { licensed_in: ["CA", "NY"], language: "es" };
    expect(parseAttributes(formatAttributes(attributes))).toEqual(attributes);
  });
});

describe("issue labels", () => {
  test("name the row in the form's own words", () => {
    expect(issueLabel(["questions", 1, "key"])).toBe("Question 2");
    expect(issueLabel(["locations", 0, "url"])).toBe("Location 1");
    expect(issueLabel(["step_minutes"])).toBe("Time between start times");
    expect(issueLabel([])).toBe("This form");
  });
});
