"use client";

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
import { Field, FieldLabel } from "@coss/ui/components/field";
import { CalendarClockIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { UtcDateTimeField } from "@/components/fields/date-field";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { rescheduleEmailAction } from "./actions";

type Target = {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  emailId: string;
  /** The current `scheduled_at` (ISO 8601, UTC). */
  scheduledAt: string;
};

/** `2026-10-12T09:00:00.000Z` → `2026-10-12T09:00` (in UTC). */
function utcMinute(iso: string): string {
  return iso.slice(0, 16);
}

export function RescheduleEmailDialog(props: Target) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button variant="outline" />}>Reschedule</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <RescheduleEmailForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function RescheduleEmailForm(props: Target & { onDone: () => void }) {
  const [state, formAction, pending] = useActionToast(rescheduleEmailAction, {
    success: (data) => ({
      title: "Email rescheduled",
      description: `It will be sent at ${utcMinute(data.scheduledAt).replace("T", " ")} UTC.`,
    }),
  });
  const { onDone } = props;

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="emailId" type="hidden" value={props.emailId} />
      <DialogHeader>
        <DialogIcon icon={CalendarClockIcon} />
        <DialogTitle>Reschedule this email</DialogTitle>
        <DialogDescription>
          Choose when to send it instead, at most 30 days from now. The domain and the suppression
          list are still checked when it is sent.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Send at</FieldLabel>
          <UtcDateTimeField
            defaultValue={utcMinute(props.scheduledAt)}
            name="scheduledAt"
            required
          />
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Reschedule
        </Button>
      </DialogFooter>
    </form>
  );
}
