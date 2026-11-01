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
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  addTrackingDomainAction,
  checkTrackingDomainAction,
  removeTrackingDomainAction,
  type VerifyOutcome,
} from "../actions";

type Target = { orgSlug: string; domainId: string };

function TargetInputs(props: Target) {
  return (
    <>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="domainId" type="hidden" value={props.domainId} />
    </>
  );
}

export function AddTrackingDomainDialog(props: Target & { domainName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Add tracking domain</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <AddTrackingDomainForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function AddTrackingDomainForm(props: Target & { domainName: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionToast(addTrackingDomainAction, {
    success: {
      title: "Tracking domain added",
      description: "Publish its CNAME record. Emails switch to it once it is active.",
    },
  });
  const { onDone } = props;

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogTitle>Add a tracking domain</DialogTitle>
        <DialogDescription>
          Open and click tracking links in emails from {props.domainName} will use this hostname
          instead of coss.com&apos;s, once its CNAME record is published.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Hostname</FieldLabel>
          <Input autoFocus defaultValue={`links.${props.domainName}`} name="hostname" required />
          <FieldDescription>
            A subdomain of {props.domainName} that you don&apos;t use for anything else.
          </FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Add tracking domain
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CheckTrackingDomainButton(props: Target & { restart: boolean }) {
  const [, formAction, pending] = useActionToast(checkTrackingDomainAction, {
    success: trackingCheckToast,
    errors: "toast",
  });

  return (
    <form action={formAction}>
      <TargetInputs {...props} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        {props.restart ? "Restart setup" : "Check now"}
      </Button>
    </form>
  );
}

function trackingCheckToast({ status, restarted }: VerifyOutcome) {
  if (restarted) return "Tracking domain setup restarted";
  if (status === "active") return "Tracking domain active";
  return status === "failed"
    ? ({
        type: "warning",
        title: "Tracking domain setup failed",
        description: "Check its CNAME record, then restart setup.",
      } as const)
    : ({
        type: "info",
        title: "Tracking domain not active yet",
        description: "We keep checking automatically once its CNAME record is published.",
      } as const);
}

export function RemoveTrackingDomainButton(props: Target & { hostname: string }) {
  const [state, formAction, pending] = useActionToast(removeTrackingDomainAction, {
    success: `${props.hostname} removed`,
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Remove
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {props.hostname}?</AlertDialogTitle>
            <AlertDialogDescription>
              New emails will use coss.com&apos;s tracking host. Tracked links and open pixels in
              emails already sent through {props.hostname} will stop working.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Remove tracking domain
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
