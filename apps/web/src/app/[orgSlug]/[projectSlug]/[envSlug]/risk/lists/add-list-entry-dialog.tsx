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
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { addRiskListEntryAction } from "../actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

const LISTS = [
  { value: "block", label: "Block list" },
  { value: "allow", label: "Allow list" },
];

const TYPES = [
  { value: "email", label: "Email address", placeholder: "jane@example.com" },
  { value: "domain", label: "Email domain", placeholder: "example.com" },
  { value: "ip", label: "IP address or range", placeholder: "203.0.113.0/24" },
  { value: "asn", label: "Network (AS number)", placeholder: "AS64500" },
  { value: "country", label: "Country", placeholder: "DE" },
  { value: "user", label: "User id", placeholder: "u_42" },
];

export function AddRiskListEntryDialog(props: Target) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Add entry</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <AddRiskListEntryForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function AddRiskListEntryForm(props: Target & { onDone: () => void }) {
  const [state, formAction, pending] = useActionToast(addRiskListEntryAction, {
    success: ({ created }) =>
      created
        ? {
            title: "Entry added",
            description: "Matching assessments are decided by it from now on.",
          }
        : { title: "Already listed", description: "Nothing changed." },
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
        <DialogTitle>Add a list entry</DialogTitle>
        <DialogDescription>
          An allow-list match makes the decision <code>allow</code> whatever else fired; a
          block-list match makes it <code>block</code>.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>List</FieldLabel>
          <Select defaultValue="block" items={LISTS} name="list">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {LISTS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Match on</FieldLabel>
          <Select defaultValue="domain" items={TYPES} name="type">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {TYPES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Value</FieldLabel>
          <Input autoFocus maxLength={320} name="value" placeholder="example.com" required />
          <FieldDescription>
            Email addresses match their mailbox (dots and +tags folded at Gmail and similar),
            domains include their subdomains, IP ranges use CIDR notation.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Note</FieldLabel>
          <Input maxLength={500} name="note" placeholder="Optional, e.g. why" />
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Add entry
        </Button>
      </DialogFooter>
    </form>
  );
}
