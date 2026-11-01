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
import { Field, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { addSmsSuppressionAction, removeSmsSuppressionAction } from "./actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

function TargetInputs(props: Target) {
  return (
    <>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
    </>
  );
}

export function AddSmsSuppressionDialog(props: Target) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Add number</DialogTrigger>
      <DialogPopup>
        <AddForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function AddForm(props: Target & { onDone: () => void }) {
  const [state, formAction, pending] = useActionToast(addSmsSuppressionAction, {
    success: ({ created }) =>
      created
        ? "Number suppressed"
        : { type: "info", title: "Already suppressed", description: "Nothing changed." },
  });
  const { onDone } = props;
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogTitle>Suppress a number</DialogTitle>
        <DialogDescription>Messages from this environment to it are skipped.</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Phone number</FieldLabel>
          <Input autoFocus name="phoneNumber" placeholder="+14155550123" required type="tel" />
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Suppress number
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RemoveSmsSuppressionButton(
  props: Target & { suppressionId: string; phoneNumber: string; optOut: boolean },
) {
  const [state, formAction, pending] = useActionToast(removeSmsSuppressionAction, {
    success: `${props.phoneNumber} is no longer suppressed`,
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="destructive-outline" />}>
        Remove
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <input name="suppressionId" type="hidden" value={props.suppressionId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {props.phoneNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              {props.optOut
                ? "This person replied STOP. Texting them again without their consent breaks carrier rules and US law (TCPA); remove the entry only if they asked to receive messages again (they can also reply START)."
                : "Messages from this environment will be sent to this number again."}
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Remove suppression
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
