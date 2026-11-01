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
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { addSuppressionAction } from "./actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

export function AddSuppressionDialog(props: Target) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Add address</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <AddSuppressionForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function AddSuppressionForm(props: Target & { onDone: () => void }) {
  const [state, formAction, pending] = useActionToast(addSuppressionAction, {
    success: ({ created }) => {
      if (created) {
        return {
          title: "Address suppressed",
          description: "Emails from this environment will skip it.",
        };
      }
      return {
        type: "info",
        title: "Already suppressed",
        description: "It already had an entry with this scope; nothing changed.",
      };
    },
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
      <DialogHeader>
        <DialogTitle>Suppress an address</DialogTitle>
        <DialogDescription>
          Emails from this environment skip suppressed recipients; the rest of each email is still
          sent.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Email address</FieldLabel>
          <Input autoFocus name="address" placeholder="jane@example.com" required type="email" />
        </Field>
        <Field>
          <FieldLabel>Category</FieldLabel>
          <Input maxLength={256} name="category" placeholder="All emails" />
          <FieldDescription>
            Leave empty to suppress every email. Otherwise only emails sent with this{" "}
            <code>category</code> (e.g. <code>marketing</code>) skip the address.
          </FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Suppress address
        </Button>
      </DialogFooter>
    </form>
  );
}
