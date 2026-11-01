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
import { useActionState, useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { deleteTemplateAction, updateTemplateAction } from "../actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string; templateId: string };

function Hidden(props: Target) {
  return (
    <>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="templateId" type="hidden" value={props.templateId} />
    </>
  );
}

type Template = { name: string; alias: string | null; description: string | null };

export function TemplateSettingsDialog(props: { target: Target; template: Template }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Settings</DialogTrigger>
      <DialogPopup>
        <SettingsForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function SettingsForm(props: { target: Target; template: Template }) {
  const [state, formAction, pending] = useActionState(updateTemplateAction, null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (state?.ok) setSaved(true);
  }, [state]);
  if (saved) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Template saved</DialogTitle>
          <DialogDescription>
            If you changed the alias, sends must use the new one from now on.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={formAction} className="contents">
      <Hidden {...props.target} />
      <DialogHeader>
        <DialogTitle>Template settings</DialogTitle>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input defaultValue={props.template.name} maxLength={100} name="name" required />
        </Field>
        <Field>
          <FieldLabel>Alias</FieldLabel>
          <Input
            className="font-mono"
            defaultValue={props.template.alias ?? ""}
            maxLength={64}
            name="alias"
            pattern="[a-z0-9][a-z0-9_\-]{0,63}"
          />
          <FieldDescription>
            What sends can pass as <code>template_id</code> instead of the id. Changing it breaks
            sends that use the old one.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Description</FieldLabel>
          <Textarea
            defaultValue={props.template.description ?? ""}
            maxLength={500}
            name="description"
          />
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteTemplateButton(props: { target: Target; name: string }) {
  // On success the action redirects to the template list.
  const [state, formAction, pending] = useActionState(deleteTemplateAction, null);
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props.target} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{props.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its draft and every version are deleted. Emails already sent keep their content; sends
              that name the template fail from now on.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete template
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
