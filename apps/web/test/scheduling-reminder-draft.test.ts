import { describe, expect, test } from "bun:test";
import { REMINDER_ANCHORS, REMINDER_SENDS, Reminders } from "@coss/scheduling/schemas";
import {
  type Draft,
  draftOf,
  NEW_DRAFT,
  ruleOf,
  type Send,
} from "../src/lib/scheduling-reminder-draft";

/** Everything filled in, then set to one timing and recipient: hidden fields keep their values. */
const full: Draft = {
  ...NEW_DRAFT,
  subject: "Hello {{attendee_first_name}}",
  message: "See you {{time_until}}.",
  smsMessage: "{{event_title}} is {{time_until}}.",
  buttonLabel: "Go",
  buttonUrl: "https://example.com/{{booking_id}}",
  includeInvite: true,
  sendIfLate: true,
  metadata: "plan=pro",
  locationTypes: ["zoom"],
};

describe("what the reminder dialog saves", () => {
  test("is valid whatever's hidden, for every timing and recipient", () => {
    const refused: string[] = [];
    for (const anchor of REMINDER_ANCHORS) {
      for (const direction of ["before", "after"] as const) {
        for (const send of REMINDER_SENDS) {
          for (const emailTo of ["", "desk@example.com"]) {
            const draft: Draft = { ...full, anchor, direction, send: [send as Send], emailTo };
            const parsed = Reminders.safeParse([ruleOf(draft)]);
            if (!parsed.success) {
              const issue = parsed.error.issues[0];
              refused.push(
                `${anchor} ${direction} ${send} ${emailTo}: ${issue?.path.join(".")} ${issue?.message}`,
              );
            }
          }
        }
      }
    }
    expect(refused).toEqual([]);
  });

  test("an invitation only goes where it can", () => {
    expect(ruleOf({ ...full, anchor: "start", direction: "before" }).include_invite).toBe(true);
    expect(ruleOf({ ...full, anchor: "end", direction: "after" }).include_invite).toBe(false);
    expect(ruleOf({ ...full, anchor: "start", direction: "after" }).include_invite).toBe(false);
    expect(ruleOf({ ...full, send: ["webhook"] }).include_invite).toBe(false);
  });

  test("words only go with the channel they're for", () => {
    const webhook = ruleOf({ ...full, send: ["webhook"] });
    expect(webhook.subject).toBeNull();
    expect(webhook.message).toBeNull();
    expect(webhook.button).toBeNull();
    expect(webhook.sms_message).toBeNull();
    expect(ruleOf({ ...full, send: ["sms_attendee"] }).sms_message).not.toBeNull();
    expect(ruleOf({ ...full, send: ["sms_attendee"] }).message).toBeNull();
    // An address counts as an email to send.
    expect(ruleOf({ ...full, send: [], emailTo: "desk@example.com" }).message).not.toBeNull();
  });

  test("a saved rule opens and saves as itself", () => {
    const rule = ruleOf({ ...full, key: "named", send: ["email_attendee", "sms_host"] });
    expect(ruleOf(draftOf(rule))).toEqual(rule);
  });

  test("conditions that lines can't hold survive being opened and saved", () => {
    const metadata = { plan: " pro ", "a=b": "c", note: "two\nlines" };
    const rule = ruleOf({ ...NEW_DRAFT, key: "named" });
    const withThem = { ...rule, only_if: { metadata, location_types: null } };
    expect(ruleOf(draftOf(withThem)).only_if?.metadata).toEqual(metadata);
    // Editing them reads what's there now.
    expect(ruleOf({ ...draftOf(withThem), metadata: "plan=free" }).only_if?.metadata).toEqual({
      plan: "free",
    });
    // Clearing them means no condition.
    expect(ruleOf({ ...draftOf(withThem), metadata: "" }).only_if).toBeNull();
  });

  test("a new reminder's key comes from its timing, and editing keeps it", () => {
    const made = ruleOf({ ...NEW_DRAFT, amount: "2" });
    expect(made.key).toBe("start-120");
    // What's waiting for it is found by its key: a new one would be a different reminder.
    expect(ruleOf({ ...draftOf(made), amount: "3" }).key).toBe("start-120");
    const named = ruleOf({ ...NEW_DRAFT, key: "nudge" });
    expect(ruleOf({ ...draftOf(named), amount: "3" }).key).toBe("nudge");
  });
});
