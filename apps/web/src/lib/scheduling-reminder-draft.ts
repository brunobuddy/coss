/**
 * What the reminder dialog is editing, and the rule it means. Fields hidden for the current timing
 * and recipients keep their values, so someone can switch back without retyping, but only what
 * applies goes into the rule: the API refuses the rest, with nothing on screen to fix it by.
 */
import type { ReminderRule } from "@coss/scheduling";
import { reminderKeyOf } from "@coss/scheduling/reminder-copy";

export type Anchor = ReminderRule["anchor"];
export type Send = ReminderRule["send"][number];
export type Unit = "minutes" | "hours" | "days";

const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

export const isTimed = (anchor: Anchor) => anchor === "start" || anchor === "end";

export function bestUnit(minutes: number): { amount: number; unit: Unit } {
  if (minutes > 0 && minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes > 0 && minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}

/** An invitation goes with a reminder before the start, or with news of the booking. */
export function supportsInvite(rule: Pick<ReminderRule, "anchor" | "before_minutes">): boolean {
  if (rule.anchor === "start") return rule.before_minutes !== null;
  return ["confirmed", "rescheduled", "cancelled", "declined"].includes(rule.anchor);
}

export type Draft = {
  key: string;
  anchor: Anchor;
  direction: "before" | "after";
  amount: string;
  unit: Unit;
  send: Send[];
  emailTo: string;
  subject: string;
  message: string;
  smsMessage: string;
  buttonLabel: string;
  buttonUrl: string;
  includeInvite: boolean;
  sendIfLate: boolean;
  skipNoShow: boolean | null;
  metadata: string;
  locationTypes: string[];
};

export const NEW_DRAFT: Draft = {
  key: "",
  anchor: "start",
  direction: "before",
  amount: "1",
  unit: "hours",
  send: ["email_attendee"],
  emailTo: "",
  subject: "",
  message: "",
  smsMessage: "",
  buttonLabel: "",
  buttonUrl: "",
  includeInvite: false,
  sendIfLate: false,
  skipNoShow: null,
  metadata: "",
  locationTypes: [],
};

export function draftOf(rule: ReminderRule): Draft {
  const before = rule.before_minutes !== null;
  const { amount, unit } = bestUnit(rule.before_minutes ?? rule.after_minutes ?? 0);
  return {
    // A key made from the timing is made again from the new timing, or it'd say the wrong thing.
    key: rule.key === reminderKeyOf({ ...rule, key: undefined }) ? "" : rule.key,
    anchor: rule.anchor,
    direction: before ? "before" : "after",
    amount: String(amount),
    unit,
    send: rule.send,
    emailTo: rule.email_to.join(", "),
    subject: rule.subject ?? "",
    message: rule.message ?? "",
    smsMessage: rule.sms_message ?? "",
    buttonLabel: rule.button?.label ?? "",
    buttonUrl: rule.button?.url ?? "",
    includeInvite: rule.include_invite,
    sendIfLate: rule.send_if_late,
    skipNoShow: rule.skip_no_show,
    metadata: Object.entries(rule.only_if?.metadata ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
    locationTypes: rule.only_if?.location_types ?? [],
  };
}

export function ruleOf(draft: Draft): ReminderRule {
  const minutes = Math.round(Number(draft.amount || 0) * UNIT_MINUTES[draft.unit]);
  const before = isTimed(draft.anchor) && draft.direction === "before";
  const metadata = Object.fromEntries(
    draft.metadata
      .split("\n")
      .map((line) => line.split("="))
      .filter((parts) => parts.length >= 2 && parts[0]?.trim())
      .map((parts) => [(parts[0] as string).trim(), parts.slice(1).join("=").trim()]),
  );
  const hasMetadata = Object.keys(metadata).length > 0;
  const timing = {
    before_minutes: before ? minutes : null,
    after_minutes: before ? null : minutes,
  };
  const emailTo = draft.emailTo
    .split(/[\s,]+/)
    .map((address) => address.trim())
    .filter(Boolean);
  const emails = emailTo.length > 0 || draft.send.some((item) => item.startsWith("email_"));
  const texts = draft.send.some((item) => item.startsWith("sms_"));
  return {
    key: reminderKeyOf({ key: draft.key.trim() || undefined, anchor: draft.anchor, ...timing }),
    anchor: draft.anchor,
    ...timing,
    send: draft.send,
    email_to: emailTo,
    subject: emails ? draft.subject.trim() || null : null,
    message: emails ? draft.message.trim() || null : null,
    sms_message: texts ? draft.smsMessage.trim() || null : null,
    button:
      emails && draft.buttonLabel.trim() && draft.buttonUrl.trim()
        ? { label: draft.buttonLabel.trim(), url: draft.buttonUrl.trim() }
        : null,
    include_invite:
      draft.includeInvite &&
      emails &&
      supportsInvite({ anchor: draft.anchor, before_minutes: timing.before_minutes }),
    send_if_late: draft.sendIfLate && before && draft.anchor === "start",
    skip_no_show: draft.skipNoShow ?? draft.anchor === "end",
    only_if:
      hasMetadata || draft.locationTypes.length > 0
        ? {
            metadata: hasMetadata ? metadata : null,
            location_types: draft.locationTypes.length > 0 ? draft.locationTypes : null,
          }
        : null,
  };
}
