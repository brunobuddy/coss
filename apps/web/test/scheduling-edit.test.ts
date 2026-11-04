import { describe, expect, test } from "bun:test";
import { type EventTypeObjectOutput, UpdateEventTypeRequest } from "@coss/scheduling/schemas";
import {
  eventTypeChanges,
  eventTypeFormState,
  eventTypePayload,
  formatJsonObject,
  formatOptionalJson,
  issueLabel,
  parseJsonObject,
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
  reassignment_enabled: true,
  approval_ttl_minutes: 1440,
  hold_ttl_seconds: 600,
  cancel_notice_minutes: 60,
  reschedule_notice_minutes: 90,
  max_guests: 3,
  max_active_bookings_per_attendee: null,
  host_calendar_details: "full",
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
    metadata: parseJsonObject(formatOptionalJson(eventType.metadata), "Metadata") ?? {},
    host_filter: parseJsonObject(formatJsonObject(eventType.host_filter), "Filter"),
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
      max_guests: 0,
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

  test("a host added by their uid is sent as typed, for the service to resolve", () => {
    const changes = eventTypeChanges(
      EVENT_TYPE,
      submitted(EVENT_TYPE, (state) => {
        state.hosts.push({
          id: "new-1",
          host: "doctor_482",
          role: "member",
          weight: "100",
          schedule: null,
        });
      }),
    );
    expect(changes.hosts?.map((host) => host.host)).toEqual(["host_a", "host_b", "doctor_482"]);
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

  test("guests and calendar details are sent like the rest", () => {
    const changes = eventTypeChanges(
      EVENT_TYPE,
      submitted(EVENT_TYPE, (state) => {
        state.maxGuests = "5";
        state.calendarDetails = "neutral";
      }),
    );
    expect(changes).toEqual({ max_guests: 5, host_calendar_details: "neutral" });
  });

  test("whether a booking can go to another host is one of the form's", () => {
    const state = eventTypeFormState(EVENT_TYPE);
    expect(state.reassignmentEnabled).toBe(true);
    state.reassignmentEnabled = false;
    expect(eventTypePayload(state, "pool").reassignment_enabled).toBe(false);
  });

  test("a group never sends guests, which the API would refuse", () => {
    const state = eventTypeFormState(EVENT_TYPE);
    state.maxGuests = "4";
    expect(eventTypePayload(state, "group").max_guests).toBe(0);
  });

  test("a non-group event type never sends a capacity", () => {
    const payload = eventTypePayload(eventTypeFormState(EVENT_TYPE), "pool");
    expect(payload.capacity).toBeNull();
  });
});

describe("what an API client stored that the form can't show", () => {
  const stored: EventTypeObjectOutput = {
    ...EVENT_TYPE,
    title: " Consultation ",
    questions: [
      {
        key: "kind",
        type: "select",
        label: " Kind ",
        required: false,
        options: [" New patient ", "Two\nlines"],
      },
      { key: "note", type: "text", label: "Note", required: false, options: ["unused"] },
    ],
    locations: [{ type: "zoom", url: "https://zoom.example.com/j/1" }],
  };

  test("survives saving something else", () => {
    expect(eventTypeChanges(stored, submitted(stored))).toEqual({});
    const changes = eventTypeChanges(
      stored,
      submitted(stored, (state) => {
        state.minNotice = "5";
      }),
    );
    expect(changes).toEqual({ min_notice_minutes: 5 });
  });

  test("survives editing another row of the same list", () => {
    const changes = eventTypeChanges(
      stored,
      submitted(stored, (state) => {
        const row = state.questions[1];
        if (row) row.label = "Your note";
      }),
    );
    expect(changes.questions?.[0]).toEqual(stored.questions[0] as never);
    expect(changes.questions?.[1]?.label).toBe("Your note");
  });

  test("goes when that row itself is edited", () => {
    const changes = eventTypeChanges(
      stored,
      submitted(stored, (state) => {
        const row = state.questions[0];
        if (row) row.options = "New patient\nReturning";
        const location = state.locations[0];
        if (location) location.type = "google_meet";
      }),
    );
    expect(changes.questions?.[0]?.options).toEqual(["New patient", "Returning"]);
    expect(changes.locations).toEqual([{ type: "google_meet" }]);
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

describe("attributes and metadata as JSON", () => {
  test("whatever an API client stored survives an unrelated save", () => {
    const stored: EventTypeObjectOutput = {
      ...EVENT_TYPE,
      host_filter: { specialty: "Ear, nose and throat", languages: ["es"], "a=b": ["x, y"] },
      metadata: { note: "two\nlines", "key=with=equals": "  spaced  " },
    };
    expect(eventTypeChanges(stored, submitted(stored))).toEqual({});
  });

  test("blank means none, and an empty filter stays distinct from no filter", () => {
    expect(parseJsonObject("  ", "Metadata")).toBeNull();
    expect(formatJsonObject(null)).toBe("");
    expect(parseJsonObject(formatJsonObject({}), "Filter")).toEqual({});
    expect(formatOptionalJson({})).toBe("");
  });

  test("refuses what isn't a JSON object, saying which field", () => {
    expect(() => parseJsonObject("a=1", "Metadata")).toThrow("Metadata isn't valid JSON.");
    expect(() => parseJsonObject("[1]", "Attributes")).toThrow("Attributes must be a JSON object.");
    expect(() => parseJsonObject("null", "Attributes")).toThrow(/JSON object/);
  });
});

describe("issue labels", () => {
  test("name the row in the form's own words", () => {
    expect(issueLabel(["questions", 1, "key"])).toBe("Question 2");
    expect(issueLabel(["locations", 0, "url"])).toBe("Location 1");
    expect(issueLabel(["step_minutes"])).toBe("Time between start times");
    expect(issueLabel(["time_zone"])).toBe("Time zone");
    expect(issueLabel([])).toBe("This form");
  });
});
