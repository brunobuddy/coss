"use client";

import { LOGO_MAX_BYTES } from "@coss/scheduling/branding";
import type { HostLocationOutput } from "@coss/scheduling/schemas";
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
import {
  CalendarClockIcon,
  CalendarPlusIcon,
  MapPinIcon,
  PalmtreeIcon,
  UserRoundIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import type { ActionResult } from "@/lib/action-result";
import { formatOptionalJson } from "@/lib/scheduling-edit";
import { useActionToast } from "@/lib/toast";
import {
  approveBookingAction,
  cancelBookingAction,
  cancelReassignmentAction,
  createEventTypeAction,
  createHolidayCalendarAction,
  createHostAction,
  declineBookingAction,
  deleteHolidayCalendarAction,
  deleteHostAction,
  deleteOutOfOfficeAction,
  markNoShowAction,
  openBookerAction,
  openBookingManagerAction,
  openHostPortalAction,
  openTeamPageAction,
  saveSettingsAction,
  setEventTypeStatusAction,
  setHostStatusAction,
  undoReassignmentAction,
  updateHostAction,
  updateHostLocationsAction,
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
              <FieldLabel>Phone</FieldLabel>
              <Input name="phone" placeholder="+15551234567" type="tel" />
              <FieldDescription>Where their SMS reminders go. Optional.</FieldDescription>
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

/**
 * A hosted page in a tab of its own, for what only the API can work out or a host does themselves.
 * The tab opens on the click, since a browser blocks one opened after a server's answer, and goes to
 * the page once there's a session. If it was blocked anyway, this tab goes there instead. Coming
 * back shows whatever happened there. Returns the form's `onSubmit`.
 */
function useOpensHostedPage(state: ActionResult<{ url: string }> | null, pending: boolean) {
  const router = useRouter();
  const tab = useRef<Window | null>(null);
  const lastState = useRef(state);
  useEffect(() => {
    if (pending) return;
    const opened = tab.current;
    const answer = state === lastState.current ? null : state;
    lastState.current = state;
    tab.current = null;
    // No answer at all (the request itself failed) closes the tab too, or it stays blank.
    if (!answer?.ok || !answer.data) {
      opened?.close();
      return;
    }
    if (!opened) {
      window.location.assign(answer.data.url);
      return;
    }
    opened.location.href = answer.data.url;
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [state, pending, router]);
  // A request that fails outright goes to the page's error boundary, which unmounts this.
  useEffect(
    () => () => {
      tab.current?.close();
    },
    [],
  );
  return () => {
    tab.current = window.open("", "_blank");
    if (tab.current) tab.current.opener = null;
  };
}

export function OpenPortalButton(props: EnvTarget & { hostId: string }) {
  const [state, formAction, pending] = useActionToast(openHostPortalAction, {
    errors: "toast",
  });
  const openTab = useOpensHostedPage(state, pending);
  return (
    <form action={formAction} onSubmit={openTab}>
      <Hidden {...props} />
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        Open their page
      </Button>
    </form>
  );
}

/** The booker's page for one event type, in a tab of its own. */
export function BookEventTypeButton(props: EnvTarget & { eventTypeId: string }) {
  const [state, formAction, pending] = useActionToast(openBookerAction, { errors: "toast" });
  const openTab = useOpensHostedPage(state, pending);
  return (
    <form action={formAction} onSubmit={openTab}>
      <Hidden {...props} />
      <Button disabled={pending} size="sm" type="submit">
        New booking
      </Button>
    </form>
  );
}

export function NewBookingDialog(
  props: EnvTarget & { eventTypes: { id: string; title: string }[] },
) {
  const { eventTypes, ...target } = props;
  const [state, formAction, pending] = useActionToast(openBookerAction, {});
  const [open, setOpen] = useState(false);
  const openTab = useOpensHostedPage(state, pending);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  const items = eventTypes.map((eventType) => ({ value: eventType.id, label: eventType.title }));
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>New booking</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents" onSubmit={openTab}>
          <Hidden {...target} />
          <DialogHeader>
            <DialogIcon icon={CalendarPlusIcon} />
            <DialogTitle>New booking</DialogTitle>
            <DialogDescription>
              Opens the booker's page in a new tab, where you choose a time and enter the attendee's
              details. They're told as they would be if they'd booked it themselves.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Event type</FieldLabel>
              <Select defaultValue={items[0]?.value} items={items} name="eventTypeId" required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending} type="submit">
              Open the booker's page
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** The team page, in a tab of its own, for marking time away and moving bookings. */
export function OpenTeamPageButton(
  props: EnvTarget & {
    label: string;
    tab?: "cover" | "away";
    bookingId?: string;
    outOfOfficeId?: string;
    variant?: "default" | "outline" | "ghost";
  },
) {
  const { label, variant = "outline", ...rest } = props;
  const [state, formAction, pending] = useActionToast(openTeamPageAction, { errors: "toast" });
  const openTab = useOpensHostedPage(state, pending);
  return (
    <form action={formAction} onSubmit={openTab}>
      <Hidden {...rest} />
      <Button disabled={pending} size="sm" type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

/** The manage page for one booking, in a tab of its own, for choosing a new time. */
export function RescheduleBookingButton(props: EnvTarget & { bookingId: string }) {
  const [state, formAction, pending] = useActionToast(openBookingManagerAction, {
    errors: "toast",
  });
  const openTab = useOpensHostedPage(state, pending);
  return (
    <form action={formAction} onSubmit={openTab}>
      <Hidden {...props} />
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        Reschedule
      </Button>
    </form>
  );
}

export function EventTypeStatusButton(
  props: EnvTarget & { eventTypeId: string; status: "active" | "archived" },
) {
  const { status, ...rest } = props;
  const next = status === "active" ? "archived" : "active";
  const [state, formAction, pending] = useActionToast(setEventTypeStatusAction, {
    success: next === "active" ? "Event type restored" : "Event type archived",
    // Restoring is one click, with nowhere inline to say what went wrong. Archiving has a dialog.
    errors: next === "active" ? "toast" : "inline",
  });
  if (next === "active") {
    return (
      <form action={formAction}>
        <Hidden {...rest} status={next} />
        <Button disabled={pending} size="sm" type="submit" variant="outline">
          Restore
        </Button>
      </form>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>Archive</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...rest} status={next} />
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this event type?</AlertDialogTitle>
            <AlertDialogDescription>
              It can't be booked or moved to a new time until you restore it. Existing bookings
              stay, and can still be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
            <Button disabled={pending} type="submit" variant="destructive">
              Archive
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function HostForm(
  props: EnvTarget & {
    canEdit: boolean;
    host: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      uid: string | null;
      time_zone: string;
      attributes: Record<string, string | string[]>;
      metadata: Record<string, string>;
    };
  },
) {
  const { host, canEdit, ...target } = props;
  const [state, formAction, pending] = useActionToast(updateHostAction, {
    success: "Host saved",
  });
  // Controlled: React resets uncontrolled fields after an action, even a refused one.
  const [values, setValues] = useState({
    name: host.name,
    email: host.email ?? "",
    phone: host.phone ?? "",
    timeZone: host.time_zone,
    uid: host.uid ?? "",
    attributes: formatOptionalJson(host.attributes),
    metadata: formatOptionalJson(host.metadata),
  });
  const field = (name: keyof typeof values) => ({
    name,
    value: values[name],
    onChange: (event: { target: { value: string } }) =>
      setValues((old) => ({ ...old, [name]: event.target.value })),
  });
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Hidden {...target} hostId={host.id} />
      <fieldset className="contents" disabled={!canEdit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input {...field("name")} maxLength={100} required />
          </Field>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input {...field("email")} type="email" />
            <FieldDescription>Where their booking emails go. Optional.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Phone</FieldLabel>
            <Input {...field("phone")} placeholder="+15551234567" type="tel" />
            <FieldDescription>Where their SMS reminders go. Optional.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Time zone</FieldLabel>
            <Input {...field("timeZone")} required />
          </Field>
          <Field>
            <FieldLabel>Your id</FieldLabel>
            <Input {...field("uid")} maxLength={255} />
            <FieldDescription>Optional. The API accepts it in place of the id.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Attributes</FieldLabel>
            <Textarea
              {...field("attributes")}
              className="font-mono"
              placeholder='{ "licensed_in": ["CA", "NY"] }'
            />
            <FieldDescription>What pools filter hosts by, as a JSON object.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Metadata</FieldLabel>
            <Textarea
              {...field("metadata")}
              className="font-mono"
              placeholder='{ "team": "north" }'
            />
            <FieldDescription>
              Your own key-value pairs, as a JSON object. Don't put sensitive data here.
            </FieldDescription>
          </Field>
        </div>
        {state && !state.ok ? <FormError message={state.error} /> : null}
        {canEdit ? (
          <div>
            <Button disabled={pending} type="submit">
              Save host
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}

export function HostLocationsDialog(
  props: EnvTarget & {
    hostId: string;
    name: string;
    locations: readonly HostLocationOutput[];
  },
) {
  const { name, locations, ...rest } = props;
  const [state, formAction, pending] = useActionToast(updateHostLocationsAction, {
    success: "Locations saved",
  });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  const address = locations.find((location) => location.type === "in_person");
  const link = locations.find((location) => location.type === "link");
  const phone = locations.find((location) => location.type === "phone");
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>Locations</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...rest} />
          <DialogHeader>
            <DialogIcon icon={MapPinIcon} />
            <DialogTitle>{name}'s locations</DialogTitle>
            <DialogDescription>
              Used by event types that leave the location blank. Existing bookings keep the location
              they have.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Office address</FieldLabel>
              <Input defaultValue={address?.address} maxLength={500} name="address" />
            </Field>
            <Field>
              <FieldLabel>Meeting link</FieldLabel>
              <Input
                defaultValue={link?.url}
                maxLength={2000}
                name="url"
                placeholder="https://"
                type="url"
              />
            </Field>
            <Field>
              <FieldLabel>Phone number</FieldLabel>
              <Input
                defaultValue={phone?.number}
                maxLength={16}
                name="number"
                placeholder="+12125550100"
                type="tel"
              />
            </Field>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending} type="submit">
              Save locations
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
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

export function DeleteHostButton(
  props: EnvTarget & { hostId: string; name: string; leavePage?: "on" },
) {
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
  const [kind, setKind] = useState("one_on_one");
  const router = useRouter();
  const { orgSlug, projectSlug, envSlug } = target;
  useEffect(() => {
    if (!state?.ok) return;
    setOpen(false);
    // The rest of what it can be is set on its page.
    if (state.data) {
      router.push(`/${orgSlug}/${projectSlug}/${envSlug}/scheduling/event-types/${state.data.id}`);
    }
  }, [state, router, orgSlug, projectSlug, envSlug]);
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
              What can be booked. Hours, limits, questions and locations are set on its page next.
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
            <div className="flex flex-col gap-2">
              <span className="font-medium text-sm">Kind</span>
              <RadioGroup
                name="kind"
                onValueChange={(value) => setKind(value as string)}
                value={kind}
              >
                <Label className="flex items-center gap-2 font-normal">
                  <Radio value="one_on_one" />
                  One host
                </Label>
                <Label className="flex items-center gap-2 font-normal">
                  <Radio value="pool" />
                  Any available host in a pool
                </Label>
                <Label className="flex items-center gap-2 font-normal">
                  <Radio value="collective" />
                  Several hosts together
                </Label>
                <Label className="flex items-center gap-2 font-normal">
                  <Radio value="group" />
                  One host with several attendees
                </Label>
              </RadioGroup>
              <p className="text-muted-foreground text-xs">This can't change later.</p>
            </div>
            {kind === "group" ? (
              <Field>
                <FieldLabel>Capacity</FieldLabel>
                <Input
                  defaultValue="10"
                  max={10000}
                  min={2}
                  name="capacity"
                  required
                  type="number"
                />
                <FieldDescription>Attendees per session.</FieldDescription>
              </Field>
            ) : null}
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
            <Field>
              <FieldLabel>Where</FieldLabel>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                defaultValue=""
                name="where"
              >
                <option value="">Not set</option>
                <option value="in_person">The host's office</option>
                <option value="link">The host's meeting link</option>
                <option value="phone">The host's phone</option>
              </select>
              <FieldDescription>
                Each host sets their own under Locations. A host without one gets a booking with no
                location.
              </FieldDescription>
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

export function MarkNoShowButton(props: EnvTarget & { bookingId: string }) {
  const [state, formAction, pending] = useActionToast(markNoShowAction, {
    success: "Marked as a no-show",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>
        Mark no-show
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this as a no-show?</AlertDialogTitle>
            <AlertDialogDescription>
              Your webhook is told, follow-ups are skipped and any no-show reminder goes out. This
              can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
            <Button disabled={pending} type="submit">
              Mark no-show
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
      email_reply_to: string | null;
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
          <FieldLabel>Reply-to address</FieldLabel>
          <Input defaultValue={settings.email_reply_to ?? ""} name="emailReplyTo" type="email" />
          <FieldDescription>
            Where replies go, for emails from your own address. Optional.
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
