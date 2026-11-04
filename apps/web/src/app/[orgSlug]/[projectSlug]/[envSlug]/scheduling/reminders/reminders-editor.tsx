"use client";

import { renderEmail } from "@coss/email-layout";
import type { ReminderRule } from "@coss/scheduling";
import {
  REMINDER_NAME_VARIABLES,
  REMINDER_SAMPLE_VALUES,
  REMINDER_VARIABLES,
  type ReminderVariable,
  reminderCopyKind,
  reminderKeyOf,
  renderReminderCopy,
  STANDARD_LEADS,
  STANDARD_SUBJECTS,
} from "@coss/scheduling/reminder-copy";
import { countSegments } from "@coss/sms/segments";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@coss/ui/components/collapsible";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@coss/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { Textarea } from "@coss/ui/components/textarea";
import { BellRingIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { EmptyState } from "@/components/empty-state";
import { FormError } from "@/components/form-error";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { PREVIEW_HEAD } from "@/lib/email-preview";
import { useActionToast } from "@/lib/toast";
import { saveRemindersAction } from "../actions";
import type { EnvTarget } from "../scheduling-actions";

type Anchor = ReminderRule["anchor"];
type Send = ReminderRule["send"][number];
type Unit = "minutes" | "hours" | "days";

const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

const ANCHORS: { value: Anchor; label: string }[] = [
  { value: "start", label: "the start" },
  { value: "end", label: "the end" },
  { value: "confirmed", label: "it's confirmed" },
  { value: "rescheduled", label: "it's rescheduled" },
  { value: "cancelled", label: "it's cancelled" },
  { value: "declined", label: "it's declined" },
  { value: "pending_approval", label: "it's requested" },
  { value: "no_show", label: "it's marked a no-show" },
];
const SENDS: { value: Send; label: string }[] = [
  { value: "email_attendee", label: "Email the attendee" },
  { value: "email_host", label: "Email the host" },
  { value: "sms_attendee", label: "Text the attendee" },
  { value: "sms_host", label: "Text the host" },
  { value: "webhook", label: "Call your webhook" },
];
const SEND_SHORT: Record<Send, string> = {
  email_attendee: "Attendee email",
  email_host: "Host email",
  sms_attendee: "Attendee SMS",
  sms_host: "Host SMS",
  webhook: "Webhook",
};
const LOCATION_TYPES = [
  { value: "link", label: "A link" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In person" },
  { value: "google_meet", label: "Google Meet" },
  { value: "microsoft_teams", label: "Microsoft Teams" },
  { value: "zoom", label: "Zoom" },
];

const isTimed = (anchor: Anchor) => anchor === "start" || anchor === "end";

function bestUnit(minutes: number): { amount: number; unit: Unit } {
  if (minutes > 0 && minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes > 0 && minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}

function duration(minutes: number): string {
  const { amount, unit } = bestUnit(minutes);
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
}

/** A reminder's timing the way someone would say it. */
export function describeTiming(
  rule: Pick<ReminderRule, "anchor" | "before_minutes" | "after_minutes">,
) {
  const anchor = ANCHORS.find((found) => found.value === rule.anchor)?.label ?? rule.anchor;
  const timed = isTimed(rule.anchor);
  if (rule.before_minutes !== null) {
    return rule.before_minutes === 0
      ? `At ${anchor}`
      : `${duration(rule.before_minutes)} before ${anchor}`;
  }
  const after = rule.after_minutes ?? 0;
  if (after === 0) return timed ? `At ${anchor}` : `When ${anchor}`;
  return `${duration(after)} after ${anchor}`;
}

type Draft = {
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

const NEW_DRAFT: Draft = {
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

function draftOf(rule: ReminderRule): Draft {
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

function ruleOf(draft: Draft): ReminderRule {
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
  return {
    key: reminderKeyOf({ key: draft.key.trim() || undefined, anchor: draft.anchor, ...timing }),
    anchor: draft.anchor,
    ...timing,
    send: draft.send,
    email_to: draft.emailTo
      .split(/[\s,]+/)
      .map((address) => address.trim())
      .filter(Boolean),
    subject: draft.subject.trim() || null,
    message: draft.message.trim() || null,
    sms_message: draft.smsMessage.trim() || null,
    button:
      draft.buttonLabel.trim() && draft.buttonUrl.trim()
        ? { label: draft.buttonLabel.trim(), url: draft.buttonUrl.trim() }
        : null,
    include_invite: draft.includeInvite,
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

function Hidden(
  props: EnvTarget & { eventTypeId: string | null; reminders: ReminderRule[] | null },
) {
  return (
    <>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="eventTypeId" type="hidden" value={props.eventTypeId ?? ""} />
      <input name="reminders" type="hidden" value={JSON.stringify(props.reminders)} />
    </>
  );
}

function VariableChips(props: { sms?: boolean; onPick: (name: string) => void }) {
  const names = (Object.keys(REMINDER_VARIABLES) as ReminderVariable[]).filter(
    (name) => !props.sms || !REMINDER_NAME_VARIABLES.includes(name),
  );
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <Button
          key={name}
          onClick={() => props.onPick(name)}
          size="xs"
          title={REMINDER_VARIABLES[name]}
          type="button"
          variant="outline"
        >
          <span className="font-mono text-[0.6875rem]">{name}</span>
        </Button>
      ))}
    </div>
  );
}

function EmailPreview(props: { rule: ReminderRule; hasEmailFrom: boolean }) {
  const { rule, hasEmailFrom } = props;
  const html = useMemo(() => {
    const render = (text: string) => renderReminderCopy(text, REMINDER_SAMPLE_VALUES);
    const kind = reminderCopyKind(rule);
    const title = REMINDER_SAMPLE_VALUES.event_title;
    const own = hasEmailFrom;
    const lead = own && rule.message ? render(rule.message) : STANDARD_LEADS[kind].attendee;
    return renderEmail({
      subject: own && rule.subject ? render(rule.subject) : STANDARD_SUBJECTS[kind](title),
      blocks: [
        ...lead
          .split(/\n\s*\n/)
          .filter((paragraph) => paragraph.trim())
          .map((paragraph) => ({ paragraph })),
        {
          details: [
            { label: "What", value: title },
            {
              label: "When",
              value: `${REMINDER_SAMPLE_VALUES.date} at ${REMINDER_SAMPLE_VALUES.time}`,
            },
          ],
        },
        ...(own && rule.button
          ? [{ button: { label: render(rule.button.label), url: render(rule.button.url) } }]
          : []),
      ],
      reason: "You're receiving this because of your booking.",
    }).html;
  }, [rule, hasEmailFrom]);
  return (
    <iframe
      className="h-96 w-full rounded-lg border bg-white"
      referrerPolicy="no-referrer"
      sandbox=""
      srcDoc={PREVIEW_HEAD + html}
      title="Email preview"
    />
  );
}

function SmsPreview(props: { message: string | null }) {
  const brand = REMINDER_SAMPLE_VALUES.brand;
  const words = props.message
    ? renderReminderCopy(props.message, REMINDER_SAMPLE_VALUES)
    : `Reminder: ${REMINDER_SAMPLE_VALUES.event_title}, ${REMINDER_SAMPLE_VALUES.date} at ${REMINDER_SAMPLE_VALUES.time}.`;
  const body = `${brand}: ${words} Reply STOP to opt out.`;
  const { segments } = countSegments(body);
  return (
    <p className="text-muted-foreground text-xs">
      About {segments} {segments === 1 ? "segment" : "segments"} per text, with sample values. Each
      is billed like any SMS.
    </p>
  );
}

function ReminderDialog(
  props: EnvTarget & {
    label: string;
    triggerVariant?: "default" | "ghost";
    title: string;
    initial: Draft;
    /** The whole list once this one's in it. */
    place: (rule: ReminderRule) => ReminderRule[];
    eventTypeId: string | null;
    hasEmailFrom: boolean;
    hasSmsFrom: boolean;
    settingsHref: string;
  },
) {
  const {
    label,
    triggerVariant,
    title,
    initial,
    place,
    eventTypeId,
    hasEmailFrom,
    hasSmsFrom,
    ...rest
  } = props;
  const { settingsHref, ...target } = rest;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [state, formAction, pending] = useActionToast(saveRemindersAction, {
    success: "Reminders saved",
  });
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  const change = (values: Partial<Draft>) => setDraft((current) => ({ ...current, ...values }));
  const rule = ruleOf(draft);
  const emails = draft.send.some((item) => item.startsWith("email_")) || rule.email_to.length > 0;
  const texts = draft.send.some((item) => item.startsWith("sms_"));
  const insert = (field: "subject" | "message" | "smsMessage", name: string) =>
    change({ [field]: `${draft[field]}{{${name}}}` });
  const toggleSend = (value: Send, on: boolean) =>
    change({ send: on ? [...draft.send, value] : draft.send.filter((item) => item !== value) });

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(initial);
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="sm" variant={triggerVariant ?? "default"} />}>
        {label}
      </DialogTrigger>
      <DialogPopup className="sm:max-w-2xl">
        <form action={formAction} className="contents">
          <Hidden {...target} eventTypeId={eventTypeId} reminders={place(rule)} />
          <DialogHeader>
            <DialogIcon icon={BellRingIcon} />
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Upcoming bookings pick this up within a minute. It applies when it's due.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="font-medium text-sm">When</span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="How long"
                  className="w-20"
                  min={0}
                  onChange={(event) => change({ amount: event.target.value })}
                  type="number"
                  value={draft.amount}
                />
                <Select
                  onValueChange={(value) => change({ unit: value as Unit })}
                  value={draft.unit}
                >
                  <SelectTrigger aria-label="Unit" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="minutes">minutes</SelectItem>
                    <SelectItem value="hours">hours</SelectItem>
                    <SelectItem value="days">days</SelectItem>
                  </SelectPopup>
                </Select>
                {isTimed(draft.anchor) ? (
                  <Select
                    onValueChange={(value) => change({ direction: value as "before" | "after" })}
                    value={draft.direction}
                  >
                    <SelectTrigger aria-label="Before or after" className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="before">before</SelectItem>
                      <SelectItem value="after">after</SelectItem>
                    </SelectPopup>
                  </Select>
                ) : (
                  <span className="text-sm">after</span>
                )}
                <Select
                  items={ANCHORS}
                  onValueChange={(value) => change({ anchor: value as Anchor })}
                  value={draft.anchor}
                >
                  <SelectTrigger aria-label="Timed from" className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {ANCHORS.map((anchor) => (
                      <SelectItem key={anchor.value} value={anchor.value}>
                        {anchor.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
              <p className="text-muted-foreground text-xs">
                {rule.before_minutes !== null
                  ? "Booked after that moment, it's skipped, and the booking says so."
                  : describeTiming(rule)}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-medium text-sm">Send</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {SENDS.map((send) => (
                  <Label className="flex items-center gap-2 font-normal" key={send.value}>
                    <Checkbox
                      checked={draft.send.includes(send.value)}
                      onCheckedChange={(checked) => toggleSend(send.value, checked === true)}
                    />
                    {send.label}
                  </Label>
                ))}
              </div>
              {texts && !hasSmsFrom ? (
                <p className="text-muted-foreground text-xs">
                  Texts need an SMS number in{" "}
                  <Link className="underline" href={settingsHref}>
                    settings
                  </Link>
                  , and the attendee's phone. Getting their consent is yours to do.
                </p>
              ) : null}
            </div>

            {emails ? (
              <div className="flex flex-col gap-4 rounded-lg border p-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-sm">Email wording</span>
                  {hasEmailFrom ? (
                    <p className="text-muted-foreground text-xs">
                      Leave it empty for the standard words. Plain text, with no links: it's checked
                      for abuse when you save, and must be about the booking.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Your own words go out only from your own address. Add an email sender in{" "}
                      <Link className="underline" href={settingsHref}>
                        settings
                      </Link>{" "}
                      to write them.
                    </p>
                  )}
                </div>
                {hasEmailFrom ? (
                  <>
                    <Field>
                      <FieldLabel>Subject</FieldLabel>
                      <Input
                        maxLength={200}
                        onChange={(event) => change({ subject: event.target.value })}
                        placeholder={STANDARD_SUBJECTS[reminderCopyKind(rule)](
                          REMINDER_SAMPLE_VALUES.event_title,
                        )}
                        value={draft.subject}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Message</FieldLabel>
                      <Textarea
                        maxLength={2000}
                        onChange={(event) => change({ message: event.target.value })}
                        placeholder={STANDARD_LEADS[reminderCopyKind(rule)].attendee}
                        value={draft.message}
                      />
                      <FieldDescription>
                        Comes before the booking's details. Click a name to add it to the message.
                      </FieldDescription>
                    </Field>
                    <VariableChips onPick={(name) => insert("message", name)} />
                    <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                      <Field>
                        <FieldLabel>Button label</FieldLabel>
                        <Input
                          maxLength={40}
                          onChange={(event) => change({ buttonLabel: event.target.value })}
                          placeholder="Leave feedback"
                          value={draft.buttonLabel}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Button link</FieldLabel>
                        <Input
                          maxLength={500}
                          onChange={(event) => change({ buttonUrl: event.target.value })}
                          placeholder="https://example.com/feedback?b={{booking_id}}"
                          value={draft.buttonUrl}
                        />
                      </Field>
                    </div>
                    <p className="-mt-2 text-muted-foreground text-xs">
                      The link must be on one of your verified domains.
                    </p>
                  </>
                ) : null}
                <EmailPreview hasEmailFrom={hasEmailFrom} rule={rule} />
              </div>
            ) : null}

            {texts ? (
              <div className="flex flex-col gap-3 rounded-lg border p-4">
                <Field>
                  <FieldLabel>Text message</FieldLabel>
                  <Textarea
                    maxLength={320}
                    onChange={(event) => change({ smsMessage: event.target.value })}
                    placeholder="Leave it empty for the standard words."
                    value={draft.smsMessage}
                  />
                  <FieldDescription>
                    No links or names. Your brand goes first and "Reply STOP to opt out." goes last.
                  </FieldDescription>
                </Field>
                <VariableChips onPick={(name) => insert("smsMessage", name)} sms />
                <SmsPreview message={rule.sms_message} />
              </div>
            ) : null}

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 font-medium text-sm">
                <ChevronDownIcon className="size-4" />
                More options
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <div className="flex flex-col gap-4 pt-3">
                  <Field>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      maxLength={64}
                      onChange={(event) => change({ key: event.target.value })}
                      placeholder={reminderKeyOf({ ...rule, key: undefined })}
                      value={draft.key}
                    />
                    <FieldDescription>
                      How webhooks and the booking's page refer to it: a-z, 0-9, _ and -.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel>Also email</FieldLabel>
                    <Input
                      onChange={(event) => change({ emailTo: event.target.value })}
                      placeholder="desk@example.com"
                      value={draft.emailTo}
                    />
                    <FieldDescription>
                      Up to 5 addresses: members of your organization, or on your verified domains.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel>Only for bookings with this metadata</FieldLabel>
                    <Textarea
                      onChange={(event) => change({ metadata: event.target.value })}
                      placeholder="plan=pro"
                      value={draft.metadata}
                    />
                    <FieldDescription>One per line. All of them must match.</FieldDescription>
                  </Field>
                  <div className="flex flex-col gap-2">
                    <span className="font-medium text-sm">Only at these locations</span>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {LOCATION_TYPES.map((type) => (
                        <Label className="flex items-center gap-2 font-normal" key={type.value}>
                          <Checkbox
                            checked={draft.locationTypes.includes(type.value)}
                            onCheckedChange={(checked) =>
                              change({
                                locationTypes:
                                  checked === true
                                    ? [...draft.locationTypes, type.value]
                                    : draft.locationTypes.filter((item) => item !== type.value),
                              })
                            }
                          />
                          {type.label}
                        </Label>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {rule.before_minutes !== null && draft.anchor === "start" ? (
                      <Label className="flex items-center gap-2 font-normal">
                        <Checkbox
                          checked={draft.sendIfLate}
                          onCheckedChange={(checked) => change({ sendIfLate: checked === true })}
                        />
                        If it's booked after this moment, send it right away
                      </Label>
                    ) : null}
                    {(rule.before_minutes !== null && draft.anchor === "start") ||
                    ["confirmed", "rescheduled", "cancelled", "declined"].includes(draft.anchor) ? (
                      <Label className="flex items-center gap-2 font-normal">
                        <Checkbox
                          checked={draft.includeInvite}
                          onCheckedChange={(checked) => change({ includeInvite: checked === true })}
                        />
                        Attach the calendar invitation
                      </Label>
                    ) : null}
                    <Label className="flex items-center gap-2 font-normal">
                      <Checkbox
                        checked={rule.skip_no_show}
                        onCheckedChange={(checked) => change({ skipNoShow: checked === true })}
                      />
                      Don't send it once the booking is marked a no-show
                    </Label>
                  </div>
                </div>
              </CollapsiblePanel>
            </Collapsible>
          </DialogPanel>
          {/* Outside the panel: it scrolls, and Save is down here, where this has to be seen. */}
          {state && !state.ok ? (
            <div className="px-6 pt-3">
              <FormError message={state.error} />
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending} type="submit">
              Save reminder
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function ListButton(
  props: EnvTarget & {
    eventTypeId: string | null;
    reminders: ReminderRule[] | null;
    success: string;
    label: string;
    variant?: "ghost" | "outline";
  },
) {
  const { success, label, variant, eventTypeId, reminders, ...target } = props;
  const [state, formAction, pending] = useActionToast(saveRemindersAction, {
    success,
    errors: "toast",
  });
  return (
    <form action={formAction}>
      <Hidden {...target} eventTypeId={eventTypeId} reminders={reminders} />
      <Button
        disabled={pending || state === undefined}
        size="sm"
        type="submit"
        variant={variant ?? "ghost"}
      >
        {label}
      </Button>
    </form>
  );
}

export function RemindersEditor(
  props: EnvTarget & {
    canEdit: boolean;
    eventTypeId: string | null;
    eventTypes: { id: string; title: string; own: boolean }[];
    hasEmailFrom: boolean;
    hasSmsFrom: boolean;
    rules: ReminderRule[];
    schedulingPath: string;
    source: "event_type" | "environment" | "default";
  },
) {
  const {
    canEdit,
    eventTypeId,
    eventTypes,
    hasEmailFrom,
    hasSmsFrom,
    rules,
    schedulingPath,
    source,
  } = props;
  const target = { orgSlug: props.orgSlug, projectSlug: props.projectSlug, envSlug: props.envSlug };
  const router = useRouter();
  const inherited = eventTypeId !== null && source !== "event_type";
  const editable = canEdit && !inherited;
  const dialogProps = {
    ...target,
    eventTypeId,
    hasEmailFrom,
    hasSmsFrom,
    settingsHref: `${schedulingPath}/settings`,
  };
  const scopeItems = [
    { value: "all", label: "All event types" },
    ...eventTypes.map((eventType) => ({
      value: eventType.id,
      label: eventType.own ? `${eventType.title} (its own)` : eventType.title,
    })),
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          editable && rules.length < 10 ? (
            <ReminderDialog
              {...dialogProps}
              initial={NEW_DRAFT}
              label="Add a reminder"
              place={(rule) => [...rules, rule]}
              title="Add a reminder"
            />
          ) : null
        }
        description="What goes out around a booking: when, to whom and in whose words. Webhooks for a booking's start and end always fire."
        title="Reminders"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          items={scopeItems}
          onValueChange={(value) =>
            router.push(
              value === "all"
                ? `${schedulingPath}/reminders`
                : `${schedulingPath}/reminders?event_type=${value}`,
            )
          }
          value={eventTypeId ?? "all"}
        >
          <SelectTrigger aria-label="Which event types" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {scopeItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        {inherited && canEdit ? (
          <ListButton
            {...target}
            eventTypeId={eventTypeId}
            label="Give it its own list"
            reminders={rules}
            success="It has its own list now"
            variant="outline"
          />
        ) : null}
        {eventTypeId !== null && source === "event_type" && canEdit ? (
          <ListButton
            {...target}
            eventTypeId={eventTypeId}
            label="Use the list for all event types"
            reminders={null}
            success="It uses the list for all event types"
          />
        ) : null}
        {inherited ? (
          <p className="text-muted-foreground text-sm">
            This event type uses the list for all event types.
          </p>
        ) : null}
      </div>

      {rules.length === 0 ? (
        <Panel>
          <EmptyState
            action={
              editable ? (
                <ReminderDialog
                  {...dialogProps}
                  initial={NEW_DRAFT}
                  label="Add a reminder"
                  place={(rule) => [rule]}
                  title="Add a reminder"
                />
              ) : undefined
            }
            compact
            description="Standard confirmations still go out, and so do webhooks."
            icon={BellRingIcon}
            title="No reminders"
          />
        </Panel>
      ) : (
        <Panel>
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Send</TableHead>
                <TableHead>Wording</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule, index) => (
                <TableRow key={rule.key}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>{describeTiming(rule)}</span>
                      <span className="font-mono text-muted-foreground text-xs">{rule.key}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {rule.send.map((send) => (
                        <Badge key={send} variant="outline">
                          {SEND_SHORT[send]}
                        </Badge>
                      ))}
                      {rule.email_to.map((address) => (
                        <Badge key={address} variant="outline">
                          {address}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {rule.subject || rule.message || rule.sms_message || rule.button
                      ? "Your own"
                      : "Standard"}
                    {rule.only_if ? ", some bookings" : ""}
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <div className="flex justify-end gap-1">
                        <ReminderDialog
                          {...dialogProps}
                          initial={draftOf(rule)}
                          label="Edit"
                          place={(edited) =>
                            rules.map((other, position) => (position === index ? edited : other))
                          }
                          title="Edit this reminder"
                          triggerVariant="ghost"
                        />
                        <ListButton
                          {...target}
                          eventTypeId={eventTypeId}
                          label="Remove"
                          reminders={rules.filter((_, position) => position !== index)}
                          success="Reminder removed"
                        />
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
      {source === "default" && editable ? (
        <p className="text-muted-foreground text-sm">
          This is the default. Changing anything here makes it your list.
        </p>
      ) : null}
    </div>
  );
}
