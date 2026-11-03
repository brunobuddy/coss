"use client";

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
import { Textarea } from "@coss/ui/components/textarea";
import { CalendarClockIcon, UserRoundIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  cancelBookingAction,
  createEventTypeAction,
  createHostAction,
  deleteHostAction,
  openHostPortalAction,
  saveSettingsAction,
  setHostStatusAction,
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
  return (
    <Dialog>
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

export function NewEventTypeDialog(props: EnvTarget & { hosts: { id: string; name: string }[] }) {
  const { hosts, ...target } = props;
  const [state, formAction, pending] = useActionToast(createEventTypeAction, {
    success: "Event type created",
  });
  return (
    <Dialog>
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

export function SettingsForm(
  props: EnvTarget & {
    canEdit: boolean;
    settings: {
      allowed_origins: string[];
      brand_name: string | null;
      email_from: string | null;
      sms_from: string | null;
      calendar_failure_mode: "hide" | "last_known";
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
