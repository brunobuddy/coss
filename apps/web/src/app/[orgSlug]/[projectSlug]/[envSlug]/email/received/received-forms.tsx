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
import { Textarea } from "@coss/ui/components/textarea";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { deleteReceivedEmailAction, simulateReceivedEmailAction } from "./actions";

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

export function SimulateReceivedEmailDialog(props: Target & { defaultTo: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Send a test email
      </DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <SimulateForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function SimulateForm(props: Target & { defaultTo: string }) {
  const [state, formAction, pending] = useActionToast(simulateReceivedEmailAction, {
    success: "Test email received",
  });

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogTitle>Send a test email</DialogTitle>
        <DialogDescription>
          Receives a message here as if it came from outside, without any email being sent: webhooks
          fire as for a real one. Put <code>[coss-test:spam]</code> or{" "}
          <code>[coss-test:virus]</code> in the subject to try the verdicts.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>To</FieldLabel>
          <Input defaultValue={props.defaultTo} name="to" required type="email" />
          <FieldDescription>
            Any address at this environment&apos;s receiving domains.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>From</FieldLabel>
          <Input defaultValue="Jane Doe <jane@example.com>" name="from" />
        </Field>
        <Field>
          <FieldLabel>Subject</FieldLabel>
          <Input autoFocus defaultValue="Hello from a test" name="subject" />
        </Field>
        <Field>
          <FieldLabel>Text</FieldLabel>
          <Textarea name="text" rows={4} />
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Receive it
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteReceivedEmailButton(props: Target & { receivedEmailId: string }) {
  const [state, formAction, pending] = useActionToast(deleteReceivedEmailAction, {
    success: "Email deleted",
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <input name="receivedEmailId" type="hidden" value={props.receivedEmailId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this email?</AlertDialogTitle>
            <AlertDialogDescription>
              Its raw message, bodies and attachments are deleted right away, for the dashboard and
              the API alike. This can&apos;t be undone.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete email
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
