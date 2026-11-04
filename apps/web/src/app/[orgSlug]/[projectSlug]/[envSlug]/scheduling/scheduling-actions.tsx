"use client";

import { LOGO_MAX_BYTES } from "@coss/scheduling/branding";
import { OUT_OF_OFFICE_REASON_LABELS, REASSIGNMENT_REASON_LABELS } from "@coss/scheduling/schemas";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@coss/ui/components/alert-dialog";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
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
import { Radio, RadioGroup } from "@coss/ui/components/radio-group";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { Switch } from "@coss/ui/components/switch";
import { Textarea } from "@coss/ui/components/textarea";
import { ArrowRightLeftIcon, CalendarClockIcon, PalmtreeIcon, UserRoundIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  approveBookingAction,
  cancelBookingAction,
  cancelReassignmentAction,
  createEventTypeAction,
  createHolidayCalendarAction,
  createHostAction,
  createOutOfOfficeAction,
  declineBookingAction,
  deleteHolidayCalendarAction,
  deleteHostAction,
  deleteOutOfOfficeAction,
  openHostPortalAction,
  previewReassignmentAction,
  reassignBookingAction,
  saveSettingsAction,
  setHostStatusAction,
  startReassignmentAction,
  undoReassignmentAction,
} from "./actions";

export type EnvTarget = { orgSlug: string; projectSlug: string; envSlug: string };

function Hidden(props: EnvTarget & Record<string, string | undefined>) {
  return (
    <>
      {Object.entries(props).map(([name, value]) =>
        value ? <input key={name} name={name} type="hidden" value={value} /> : null,
      )}
    </>
  );
}

export function NewHostDialog(props: EnvTarget) {
  const [state, formAction, pending] = useActionToast(createHostAction, {
    success: "Host created",
  });
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>New host</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <DialogHeader>
            <DialogIcon icon={UserRoundIcon} />
            <DialogTitle>New host</DialogTitle>
            <DialogDescription>
              Someone who can be booked. They start with weekday hours, 9 to 5, which they can
              change on their own page.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input maxLength={100} name="name" required />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input name="email" type="email" />
              <FieldDescription>Where their booking emails go. Optional.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Time zone</FieldLabel>
              <Input defaultValue={timeZone} name="timeZone" required />
            </Field>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending} type="submit">
              Create host
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function OpenPortalButton(props: EnvTarget & { hostId: string }) {
  const [state, formAction, pending] = useActionToast(openHostPortalAction, {
    errors: "toast",
  });
  useEffect(() => {
    if (state?.ok && state.data) {
      window.open(state.data.url, "_blank", "noopener,noreferrer");
    }
  }, [state]);
  return (
    <form action={formAction}>
      <Hidden {...props} />
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        Open their page
      </Button>
    </form>
  );
}

export function HostStatusButton(props: EnvTarget & { hostId: string; status: string }) {
  const next = props.status === "active" ? "disabled" : "active";
  const [, formAction, pending] = useActionToast(setHostStatusAction, {
    success: next === "active" ? "Host enabled" : "Host disabled",
    errors: "toast",
  });
  return (
    <form action={formAction}>
      <Hidden {...props} status={next} />
      <Button disabled={pending} size="sm" type="submit" variant="ghost">
        {next === "active" ? "Enable" : "Disable"}
      </Button>
    </form>
  );
}

export function DeleteHostButton(props: EnvTarget & { hostId: string; name: string }) {
  const [state, formAction, pending] = useActionToast(deleteHostAction, {
    success: "Host deleted",
  });
  const { name, ...rest } = props;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>Delete</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...rest} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their schedules and connected calendars are removed. A host with upcoming bookings
              can't be deleted: cancel those, or disable the host.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep</AlertDialogClose>
            <Button disabled={pending} type="submit" variant="destructive">
              Delete host
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

type Candidate = {
  host: string;
  name: string;
  member: boolean;
  available: boolean;
  reason: string | null;
  load: number;
  meeting_provider_missing: boolean;
};

const WHY_NOT: Record<string, string> = {
  out_of_office: "Out of office",
  outside_coverage: "Only covers for someone at other times",
  outside_availability: "Outside their hours",
  host_busy: "Busy on their calendar",
  limit_reached: "At their booking limit",
  calendar_unverified: "Their calendar can't be read",
  already_claimed: "Already booked",
  host_unavailable: "Not available",
};

const REASSIGN_REASON_ITEMS = Object.entries(REASSIGNMENT_REASON_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function ReassignBookingDialog(
  props: EnvTarget & {
    bookingId: string;
    candidates: readonly Candidate[];
    hosts: readonly { id: string; name: string }[];
  },
) {
  const { candidates, hosts, bookingId, ...target } = props;
  const [state, formAction, pending] = useActionToast(reassignBookingAction, {
    success: "Booking reassigned",
  });
  const [open, setOpen] = useState(false);
  const [toHost, setToHost] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  const chosen = candidates.find((candidate) => candidate.host === toHost);
  // What choosing them means going past: spelled out here, so it's asked for and not assumed.
  const overrides = chosen
    ? [
        ...(chosen.member ? [] : ["any_host"]),
        ...(!chosen.available && chosen.reason ? [chosen.reason] : []),
      ]
    : [];
  const overriding = Boolean(chosen && !chosen.available);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Reassign</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} bookingId={bookingId} overrides={overrides.join(",")} />
          <DialogHeader>
            <DialogIcon icon={UserRoundIcon} />
            <DialogTitle>Reassign this booking</DialogTitle>
            <DialogDescription>
              It keeps its time. Whoever's leaving and joining are told.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            {hosts.length > 1 ? (
              <Field>
                <FieldLabel>Who's leaving</FieldLabel>
                <Select
                  defaultValue={hosts[0]?.id}
                  items={hosts.map((host) => ({ value: host.id, label: host.name }))}
                  name="fromHost"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {hosts.map((host) => (
                      <SelectItem key={host.id} value={host.id}>
                        {host.name}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            ) : null}
            <Field>
              <FieldLabel>Who it goes to</FieldLabel>
              <RadioGroup
                className="max-h-56 w-full gap-1 overflow-y-auto rounded-lg border p-2"
                name="toHost"
                onValueChange={(next) => setToHost(String(next))}
                value={toHost}
              >
                {candidates.map((candidate) => (
                  <Label
                    className="items-start rounded-md p-2 font-normal has-data-checked:bg-accent"
                    key={candidate.host}
                  >
                    <Radio
                      disabled={candidate.reason === "already_claimed"}
                      value={candidate.host}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span>{candidate.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {candidate.available
                          ? `Free, ${candidate.load} ${candidate.load === 1 ? "booking" : "bookings"} that week`
                          : (WHY_NOT[candidate.reason ?? ""] ?? "Not available")}
                        {candidate.member ? "" : ", doesn't usually take this"}
                        {candidate.meeting_provider_missing ? ", no meeting link" : ""}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {candidates.length === 0 ? (
                <FieldDescription>There's nobody else in this environment.</FieldDescription>
              ) : null}
            </Field>
            <Field>
              <FieldLabel>Reason</FieldLabel>
              <Select defaultValue="other" items={REASSIGN_REASON_ITEMS} name="reasonCode">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {REASSIGN_REASON_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Note</FieldLabel>
              <Textarea
                maxLength={500}
                name="note"
                onChange={(event) => setNote(event.target.value)}
                required={overriding}
                value={note}
              />
              <FieldDescription>
                {overriding
                  ? "They aren't free at this time, so say why this is going ahead."
                  : "Optional. Only shown in this booking's history."}
              </FieldDescription>
            </Field>
            <Label className="font-normal">
              <Checkbox defaultChecked name="notifyAttendee" />
              Tell the attendee
            </Label>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending || !toHost} type="submit">
              Reassign
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

const REASON_ITEMS = Object.entries(OUT_OF_OFFICE_REASON_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function NewOutOfOfficeDialog(props: EnvTarget & { hosts: { id: string; name: string }[] }) {
  const { hosts, ...target } = props;
  const [state, formAction, pending] = useActionToast(createOutOfOfficeAction, {
    success: "Time off added",
  });
  const [open, setOpen] = useState(false);
  const [wholeDays, setWholeDays] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  // Only this browser knows the zone these were typed in, so they're sent as instants.
  const instant = (value: string) => (value ? new Date(value).toISOString() : "");
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Add time off</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <DialogHeader>
            <DialogIcon icon={PalmtreeIcon} />
            <DialogTitle>Add time off</DialogTitle>
            <DialogDescription>
              They won't be offered during it. Bookings they already have stay, unless you move
              them.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Hosts</FieldLabel>
              <div className="flex max-h-40 w-full flex-col gap-2 overflow-y-auto rounded-lg border p-3">
                {hosts.map((host) => (
                  <Label className="font-normal" key={host.id}>
                    <Checkbox name="hostId" value={host.id} />
                    {host.name}
                  </Label>
                ))}
              </div>
            </Field>
            <Label className="font-normal">
              <Switch checked={wholeDays} onCheckedChange={setWholeDays} />
              Whole days
            </Label>
            {wholeDays ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>First day</FieldLabel>
                  <Input name="startDate" required type="date" />
                </Field>
                <Field>
                  <FieldLabel>Last day</FieldLabel>
                  <Input name="endDate" type="date" />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>From</FieldLabel>
                  <Input
                    onChange={(event) => setStart(event.target.value)}
                    required
                    type="datetime-local"
                    value={start}
                  />
                  <input name="start" type="hidden" value={instant(start)} />
                </Field>
                <Field>
                  <FieldLabel>Until</FieldLabel>
                  <Input
                    onChange={(event) => setEnd(event.target.value)}
                    required
                    type="datetime-local"
                    value={end}
                  />
                  <input name="end" type="hidden" value={instant(end)} />
                </Field>
              </div>
            )}
            <Field>
              <FieldLabel>Reason</FieldLabel>
              <Select defaultValue="unspecified" items={REASON_ITEMS} name="reason">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {REASON_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <FieldDescription>Never shown to people booking, or in webhooks.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Message for people booking</FieldLabel>
              <Input maxLength={300} name="publicMessage" />
              <FieldDescription>Optional. Can't contain a link.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Private notes</FieldLabel>
              <Textarea maxLength={2000} name="notes" />
            </Field>
            <Label className="font-normal">
              <Checkbox defaultChecked name="showOnCalendar" />
              Show on their calendar
            </Label>
            <Field>
              <FieldLabel>Who covers for them</FieldLabel>
              <div className="flex max-h-32 w-full flex-col gap-2 overflow-y-auto rounded-lg border p-3">
                {hosts.map((host) => (
                  <Label className="font-normal" key={host.id}>
                    <Checkbox name="delegateId" value={host.id} />
                    {host.name}
                  </Label>
                ))}
              </div>
              <FieldDescription>
                Optional. They can be booked in their place during this, if they fit the booking.
              </FieldDescription>
            </Field>
            <Label className="font-normal">
              <Checkbox name="moveBookings" />
              Move bookings already in this time to whoever's free
            </Label>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending} type="submit">
              Add time off
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

const previewDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
  timeStyle: "short",
});

const WHY_STAYS: Record<string, string> = {
  ...WHY_NOT,
  no_candidate: "Nobody's free",
  routing_unknown: "Booked before coss.com kept its routing: choose someone",
  reassignment_disabled: "This event type's bookings stay with their hosts",
  several_hosts: "Has several hosts",
  already_a_host: "Already a host of this booking",
  not_a_member: "Doesn't take this event type",
  host_unavailable: "Not available",
};

/**
 * Moving many: choose whose, see who each would go to, change any of it, then start. What's started
 * is what was seen, as `assignments`, with the run deciding again for each.
 */
export function ReassignManyDialog(
  props: EnvTarget & {
    hosts: readonly { id: string; name: string }[];
    runsPath: string;
    outOfOfficeId?: string;
    label?: string;
  },
) {
  const { hosts, runsPath, outOfOfficeId, label, ...target } = props;
  const router = useRouter();
  const [preview, previewAction, previewing] = useActionState(previewReassignmentAction, null);
  const [state, formAction, pending] = useActionToast(startReassignmentAction, {
    success: "Moving bookings",
  });
  const [open, setOpen] = useState(false);
  // Whether the answer's on screen: the action's last answer outlives closing and going back.
  const [showing, setShowing] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [before, setBefore] = useState("");
  const startOver = () => {
    setShowing(false);
    setChoices({});
  };
  useEffect(() => {
    if (preview?.ok) setShowing(true);
  }, [preview]);
  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      router.push(`${runsPath}/${state.data.id}`);
    }
  }, [state, router, runsPath]);
  const items = showing && preview?.ok ? preview.data.items : null;
  const targetOf = (item: { booking: string; to_host: string | null }) =>
    choices[item.booking] ?? item.to_host ?? "";
  const assignments = (items ?? []).flatMap((item) => {
    const to = targetOf(item);
    if (!to) return [];
    return [
      {
        booking: item.booking,
        to_host: to,
        ...(item.from_host ? { from_host: item.from_host } : {}),
      },
    ];
  });
  const nameOf = new Map(hosts.map((host) => [host.id, host.name]));
  const hostItems = hosts.map((host) => ({ value: host.id, label: host.name }));
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) startOver();
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="sm" variant={outOfOfficeId ? "ghost" : "default"} />}>
        {label ?? "Move bookings"}
      </DialogTrigger>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogIcon icon={ArrowRightLeftIcon} />
          <DialogTitle>Move bookings</DialogTitle>
          <DialogDescription>
            Times stay the same. Each host hears once. A booking nobody can take stays where it is.
          </DialogDescription>
        </DialogHeader>
        {items === null ? (
          <form action={previewAction} className="contents">
            <Hidden
              {...target}
              {...(outOfOfficeId ? { outOfOfficeId } : {})}
              startBefore={before ? new Date(before).toISOString() : ""}
            />
            <DialogPanel className="flex flex-col gap-4">
              {outOfOfficeId ? null : (
                <>
                  <Field>
                    <FieldLabel>Whose bookings</FieldLabel>
                    <Select items={hostItems} name="fromHost">
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a host" />
                      </SelectTrigger>
                      <SelectPopup>
                        {hosts.map((host) => (
                          <SelectItem key={host.id} value={host.id}>
                            {host.name}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Starting before</FieldLabel>
                    <Input
                      onChange={(event) => setBefore(event.target.value)}
                      type="datetime-local"
                      value={before}
                    />
                    <FieldDescription>Leave empty for all of them.</FieldDescription>
                  </Field>
                </>
              )}
              <Field>
                <FieldLabel>Try first</FieldLabel>
                <Select items={hostItems} name="preferredHost">
                  <SelectTrigger>
                    <SelectValue placeholder="Whoever's fairest" />
                  </SelectTrigger>
                  <SelectPopup>
                    {hosts.map((host) => (
                      <SelectItem key={host.id} value={host.id}>
                        {host.name}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
              {preview && !preview.ok ? <FormError message={preview.error} /> : null}
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
              <Button disabled={previewing} type="submit">
                See who they'd go to
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form action={formAction} className="contents">
            <Hidden {...target} assignments={JSON.stringify(assignments)} />
            <DialogPanel className="flex flex-col gap-4">
              {items.length === 0 ? (
                <p className="text-muted-foreground text-sm">There's nothing to move.</p>
              ) : (
                <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
                  {items.map((item) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md p-2"
                      key={item.booking}
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm">
                          {previewDay.format(new Date(item.start))} UTC
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {item.title}
                          {item.from_host
                            ? `, from ${nameOf.get(item.from_host) ?? "another host"}`
                            : ""}
                          {item.reason && !choices[item.booking]
                            ? `. ${WHY_STAYS[item.reason] ?? "Not available"}`
                            : ""}
                        </span>
                      </span>
                      <div className="w-48">
                        <Select
                          items={hostItems}
                          onValueChange={(next) =>
                            setChoices((current) => ({ ...current, [item.booking]: String(next) }))
                          }
                          value={targetOf(item) || null}
                        >
                          <SelectTrigger aria-label="Who it goes to">
                            <SelectValue placeholder="Stays" />
                          </SelectTrigger>
                          <SelectPopup>
                            {hosts.map((host) => (
                              <SelectItem key={host.id} value={host.id}>
                                {host.name}
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {preview?.ok && preview.data.truncated ? (
                <p className="text-muted-foreground text-xs">
                  That's the first 500. Move these, then do the rest.
                </p>
              ) : null}
              {items.length === 0 ? null : (
                <>
                  <Field>
                    <FieldLabel>Reason</FieldLabel>
                    <Select
                      defaultValue={outOfOfficeId ? "out_of_office" : "other"}
                      items={REASSIGN_REASON_ITEMS}
                      name="reasonCode"
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        {REASSIGN_REASON_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Note</FieldLabel>
                    <Textarea maxLength={500} name="note" />
                    <FieldDescription>
                      Optional. Only shown in each booking's history.
                    </FieldDescription>
                  </Field>
                  <Label className="font-normal">
                    <Checkbox defaultChecked name="notifyAttendees" />
                    Tell attendees
                  </Label>
                </>
              )}
              {state && !state.ok ? <FormError message={state.error} /> : null}
            </DialogPanel>
            <DialogFooter>
              <Button onClick={startOver} type="button" variant="ghost">
                Back
              </Button>
              {items.length === 0 ? null : (
                <Button disabled={pending || assignments.length === 0} type="submit">
                  Move {assignments.length} {assignments.length === 1 ? "booking" : "bookings"}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogPopup>
    </Dialog>
  );
}

export function CancelReassignmentButton(props: EnvTarget & { reassignmentId: string }) {
  const [, formAction, pending] = useActionToast(cancelReassignmentAction, {
    success: "Reassignment cancelled",
    errors: "toast",
  });
  return (
    <form action={formAction}>
      <Hidden {...props} />
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        Cancel the rest
      </Button>
    </form>
  );
}

export function UndoReassignmentDialog(
  props: EnvTarget & { reassignmentId: string; moved: number; runsPath: string },
) {
  const { moved, runsPath, ...hidden } = props;
  const router = useRouter();
  const [state, formAction, pending] = useActionToast(undoReassignmentAction, {
    success: "Giving bookings back",
  });
  useEffect(() => {
    if (state?.ok) router.push(`${runsPath}/${state.data.id}`);
  }, [state, router, runsPath]);
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>Undo</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...hidden} />
          <AlertDialogHeader>
            <AlertDialogTitle>
              Give back {moved} {moved === 1 ? "booking" : "bookings"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each goes back to who had it, if they're still free. One that's moved on since stays
              where it went. Each host hears once.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3 px-6">
            <Label className="font-normal">
              <Checkbox defaultChecked name="notifyAttendees" />
              Tell attendees
            </Label>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep them</AlertDialogClose>
            <Button disabled={pending} type="submit">
              Give them back
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function NewHolidayCalendarDialog(
  props: EnvTarget & {
    hosts: readonly { id: string; name: string }[];
    countries: readonly { value: string; label: string }[];
    feedsAllowed: boolean;
  },
) {
  const { hosts, countries, feedsAllowed, ...target } = props;
  const [state, formAction, pending] = useActionToast(createHolidayCalendarAction, {
    success: "Holiday calendar added",
  });
  const [open, setOpen] = useState(false);
  const [useFeed, setUseFeed] = useState(false);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Add holidays</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <DialogHeader>
            <DialogIcon icon={PalmtreeIcon} />
            <DialogTitle>Add a holiday calendar</DialogTitle>
            <DialogDescription>
              They won't be offered on those days, and it's kept up to date from now on.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input maxLength={200} name="name" required />
            </Field>
            {feedsAllowed ? (
              <Label className="font-normal">
                <Switch checked={useFeed} onCheckedChange={setUseFeed} />
                Use my own feed
              </Label>
            ) : null}
            {useFeed ? (
              <Field>
                <FieldLabel>Feed URL</FieldLabel>
                <Input name="icsUrl" placeholder="https://example.com/holidays.ics" required />
                <FieldDescription>
                  Stored encrypted, and not shown again. Only whole-day events count.
                </FieldDescription>
              </Field>
            ) : (
              <Field>
                <FieldLabel>Country</FieldLabel>
                <Select items={[...countries]} name="country" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectPopup>
                    {countries.map((country) => (
                      <SelectItem key={country.value} value={country.value}>
                        {country.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            )}
            <Field>
              <FieldLabel>Hosts</FieldLabel>
              <div className="flex max-h-32 w-full flex-col gap-2 overflow-y-auto rounded-lg border p-3">
                {hosts.map((host) => (
                  <Label className="font-normal" key={host.id}>
                    <Checkbox name="hostId" value={host.id} />
                    {host.name}
                  </Label>
                ))}
              </div>
              <FieldDescription>
                To apply it to everyone with some attribute, use the API.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Who covers</FieldLabel>
              <div className="flex max-h-24 w-full flex-col gap-2 overflow-y-auto rounded-lg border p-3">
                {hosts.map((host) => (
                  <Label className="font-normal" key={host.id}>
                    <Checkbox name="delegateId" value={host.id} />
                    {host.name}
                  </Label>
                ))}
              </div>
            </Field>
            <Label className="font-normal">
              <Checkbox name="moveBookings" />
              Move bookings already on those days to whoever's free
            </Label>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending} type="submit">
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function DeleteHolidayCalendarButton(props: EnvTarget & { calendarId: string }) {
  const [state, formAction, pending] = useActionToast(deleteHolidayCalendarAction, {
    success: "Holiday calendar removed",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>Remove</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              Its hosts can be booked on its days again, shortly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
            <Button disabled={pending} type="submit" variant="destructive">
              Remove
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function DeleteOutOfOfficeButton(props: EnvTarget & { entryId: string }) {
  const [state, formAction, pending] = useActionToast(deleteOutOfOfficeAction, {
    success: "Time off removed",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>Remove</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this time off?</AlertDialogTitle>
            <AlertDialogDescription>
              They can be booked during it again, and any event it put on their calendar goes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
            <Button disabled={pending} type="submit" variant="destructive">
              Remove
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function NewEventTypeDialog(props: EnvTarget & { hosts: { id: string; name: string }[] }) {
  const { hosts, ...target } = props;
  const [state, formAction, pending] = useActionToast(createEventTypeAction, {
    success: "Event type created",
  });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>New event type</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <DialogHeader>
            <DialogIcon icon={CalendarClockIcon} />
            <DialogTitle>New event type</DialogTitle>
            <DialogDescription>
              What can be booked. The API sets the rest: buffers, limits, questions, group sessions.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Title</FieldLabel>
              <Input maxLength={120} name="title" required />
              <FieldDescription>Shown to attendees, and in their emails.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Duration, in minutes</FieldLabel>
              <Input defaultValue="30" max={1440} min={5} name="duration" required type="number" />
            </Field>
            <RadioGroup defaultValue="one_on_one" name="kind">
              <Label className="flex items-center gap-2 font-normal">
                <Radio value="one_on_one" />
                One host
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <Radio value="pool" />
                Any available host in a pool
              </Label>
            </RadioGroup>
            <Field>
              <FieldLabel>Host</FieldLabel>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                defaultValue=""
                name="hostId"
              >
                <option value="">Add later</option>
                {hosts.map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.name}
                  </option>
                ))}
              </select>
            </Field>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending} type="submit">
              Create event type
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function ApproveBookingButton(props: EnvTarget & { bookingId: string }) {
  const [, formAction, pending] = useActionToast(approveBookingAction, {
    success: "Booking approved",
    errors: "toast",
  });
  return (
    <form action={formAction} className="contents">
      <Hidden {...props} />
      <Button disabled={pending} size="sm" type="submit" variant="ghost">
        Approve
      </Button>
    </form>
  );
}

export function DeclineBookingButton(props: EnvTarget & { bookingId: string }) {
  const [state, formAction, pending] = useActionToast(declineBookingAction, {
    success: "Booking declined",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>Decline</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              The time is freed and the attendee told. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
            <Button disabled={pending} type="submit" variant="destructive">
              Decline booking
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function CancelBookingButton(props: EnvTarget & { bookingId: string }) {
  const [state, formAction, pending] = useActionToast(cancelBookingAction, {
    success: "Booking cancelled",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>Cancel</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              The time is freed, the calendar event removed and the attendee told. It stays charged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
            <Button disabled={pending} type="submit" variant="destructive">
              Cancel booking
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

function LogoField(props: {
  canEdit: boolean;
  logo: { data_url: string; width: number; height: number } | null;
}) {
  const { canEdit, logo } = props;
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Field>
        <FieldLabel>Logo</FieldLabel>
        {logo ? (
          // A data URL we stored after checking its bytes: nothing for next/image to optimize.
          // biome-ignore lint/performance/noImgElement: see above.
          <img
            alt=""
            className="max-h-12 max-w-[200px] object-contain"
            height={logo.height}
            src={logo.data_url}
            width={logo.width}
          />
        ) : null}
        <Input
          accept="image/png,image/jpeg"
          name="logo"
          onChange={(event) => {
            const file = event.target.files?.[0];
            const tooBig = file !== undefined && file.size > LOGO_MAX_BYTES;
            setProblem(tooBig ? "That file is over 200 KB. Export a smaller one." : null);
            if (tooBig) event.target.value = "";
          }}
          type="file"
        />
        {problem ? <FormError message={problem} /> : null}
        <FieldDescription>
          A PNG or JPEG of 200 KB at most, at least 96 pixels tall so it stays sharp. On the hosted
          pages, and on emails sent from your own address. Use one that reads on white.
        </FieldDescription>
      </Field>
      {logo && canEdit ? (
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox name="removeLogo" />
          Remove the logo
        </Label>
      ) : null}
    </div>
  );
}

function AccentField(props: { color: string | null }) {
  const [enabled, setEnabled] = useState(props.color !== null);
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-sm">Accent color</span>
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox
          checked={enabled}
          name="useAccentColor"
          onCheckedChange={(checked) => setEnabled(checked === true)}
        />
        Use my own color
      </Label>
      {enabled ? (
        <Input
          aria-label="Accent color"
          className="h-9 w-16 p-1"
          defaultValue={props.color ?? "#18181b"}
          name="accentColor"
          type="color"
        />
      ) : null}
      <p className="text-muted-foreground text-xs">
        On buttons and selected days in the hosted pages, and on the button in emails sent from your
        own address. Text on it is black or white, whichever reads better.
      </p>
    </div>
  );
}

export function SettingsForm(
  props: EnvTarget & {
    canEdit: boolean;
    settings: {
      allowed_origins: string[];
      brand_name: string | null;
      accent_color: string | null;
      logo: { data_url: string; width: number; height: number } | null;
      email_from: string | null;
      sms_from: string | null;
      calendar_failure_mode: "hide" | "last_known";
      host_reassignment: "off" | "eligible";
      name_host_in_attendee_emails: boolean;
    };
  },
) {
  const { settings, canEdit, ...target } = props;
  const [state, formAction, pending] = useActionToast(saveSettingsAction, {
    success: "Settings saved",
  });
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Hidden {...target} />
      <fieldset className="contents" disabled={!canEdit}>
        <Field>
          <FieldLabel>Brand name</FieldLabel>
          <Input defaultValue={settings.brand_name ?? ""} maxLength={100} name="brandName" />
          <FieldDescription>Who booking emails and pages say they're from.</FieldDescription>
        </Field>
        <LogoField canEdit={canEdit} logo={settings.logo} />
        <AccentField color={settings.accent_color} />
        <Field>
          <FieldLabel>Email sender</FieldLabel>
          <Input defaultValue={settings.email_from ?? ""} name="emailFrom" type="email" />
          <FieldDescription>
            On one of your verified domains. Without it, emails come from coss.com on your behalf.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>SMS number</FieldLabel>
          <Input defaultValue={settings.sms_from ?? ""} name="smsFrom" placeholder="+15551234567" />
          <FieldDescription>
            Your approved number, for SMS reminders once you turn them on.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Allowed sites</FieldLabel>
          <Textarea
            defaultValue={settings.allowed_origins.join("\n")}
            name="allowedOrigins"
            placeholder="https://app.example.com"
          />
          <FieldDescription>
            Sites that can embed the hosted pages and call the client API, one per line.
          </FieldDescription>
        </Field>
        <div className="flex flex-col gap-2">
          <span className="font-medium text-sm">When a host's calendar can't be read</span>
          <RadioGroup defaultValue={settings.calendar_failure_mode} name="calendarFailureMode">
            <Label className="flex items-center gap-2 font-normal">
              <Radio value="hide" />
              Stop offering them until it's fixed
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <Radio value="last_known" />
              Keep offering their last known times, and flag those bookings
            </Label>
          </RadioGroup>
        </div>
        <Label className="font-normal">
          <Switch
            defaultChecked={settings.host_reassignment === "eligible"}
            name="hostReassignment"
          />
          Let hosts give their own bookings to someone free who takes that event type
        </Label>
        <Label className="font-normal">
          <Switch
            defaultChecked={settings.name_host_in_attendee_emails}
            name="nameHostInAttendeeEmails"
          />
          Name the new host when telling an attendee their booking has one
        </Label>
        {state && !state.ok ? <FormError message={state.error} /> : null}
        <div>
          <Button disabled={pending || !canEdit} type="submit">
            Save settings
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
