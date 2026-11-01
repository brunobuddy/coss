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
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { type MarketingFormTarget, TargetInputs } from "@/components/marketing";
import {
  addAudienceMembersAction,
  createAudienceAction,
  deleteAudienceAction,
  removeAudienceMemberAction,
  renameAudienceAction,
} from "./actions";

export function CreateAudienceDialog(props: MarketingFormTarget) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>New audience</DialogTrigger>
      <DialogPopup>
        <NameForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function NameForm(props: MarketingFormTarget) {
  const [state, formAction, pending] = useActionState(createAudienceAction, null);
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Audience created</DialogTitle>
          <DialogDescription>Add contacts to it from its page or a CSV import.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogTitle>New audience</DialogTitle>
        <DialogDescription>
          A static list of contacts, e.g. beta testers or customers.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input autoFocus maxLength={200} name="name" required />
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Create audience
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RenameAudienceForm(
  props: MarketingFormTarget & { audienceId: string; name: string },
) {
  const [state, formAction, pending] = useActionState(renameAudienceAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <TargetInputs {...props} />
      <input name="audienceId" type="hidden" value={props.audienceId} />
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input defaultValue={props.name} maxLength={200} name="name" required />
      </Field>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} size="sm" type="submit" variant="outline">
          Rename
        </Button>
      </div>
    </form>
  );
}

export function AddMembersForm(props: MarketingFormTarget & { audienceId: string }) {
  const [state, formAction, pending] = useActionState(addAudienceMembersAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <TargetInputs {...props} />
      <input name="audienceId" type="hidden" value={props.audienceId} />
      <Field>
        <FieldLabel>Add contacts</FieldLabel>
        <Textarea name="contacts" placeholder={"ada@example.com\ngrace@example.com"} rows={3} />
        <FieldDescription>
          Addresses of existing contacts, one per line. Add new people on the Contacts page first.
        </FieldDescription>
      </Field>
      {state?.ok ? (
        <p className="text-muted-foreground text-sm">
          {state.data.added} added, {state.data.existing} already members
          {state.data.missing.length > 0
            ? `; not contacts: ${state.data.missing.slice(0, 10).join(", ")}${state.data.missing.length > 10 ? "…" : ""}`
            : ""}
          .
        </p>
      ) : null}
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} size="sm" type="submit">
          Add to audience
        </Button>
      </div>
    </form>
  );
}

export function RemoveMemberButton(
  props: MarketingFormTarget & { audienceId: string; contactId: string },
) {
  const [state, formAction, pending] = useActionState(removeAudienceMemberAction, null);
  return (
    <form action={formAction}>
      <TargetInputs {...props} />
      <input name="audienceId" type="hidden" value={props.audienceId} />
      <input name="contactId" type="hidden" value={props.contactId} />
      <Button loading={pending} size="xs" type="submit" variant="outline">
        Remove
      </Button>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}

export function DeleteAudienceButton(
  props: MarketingFormTarget & { audienceId: string; name: string },
) {
  const [state, formAction, pending] = useActionState(deleteAudienceAction, null);
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete audience
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <input name="audienceId" type="hidden" value={props.audienceId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{props.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its contacts stay; only the list goes. Segments that filter on it must change first.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete audience
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
