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
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { createTemplateAction } from "./actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

export function CreateTemplateDialog(props: Target) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>New template</DialogTrigger>
      <DialogPopup>
        <CreateTemplateForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function CreateTemplateForm(props: Target) {
  // On success the action redirects to the new template's editor.
  const [state, formAction, pending] = useActionState(createTemplateAction, null);
  return (
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <DialogHeader>
        <DialogTitle>New template</DialogTitle>
        <DialogDescription>
          It starts with an English draft to edit. Sends use it once you publish it.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input autoFocus maxLength={100} name="name" placeholder="Welcome" required />
        </Field>
        <Field>
          <FieldLabel>Alias</FieldLabel>
          <Input
            className="font-mono"
            maxLength={64}
            name="alias"
            pattern="[a-z0-9][a-z0-9_\-]{0,63}"
            placeholder="welcome"
          />
          <FieldDescription>
            Optional. Send it as <code>template_id: "welcome"</code>, the same in every environment.
          </FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Create template
        </Button>
      </DialogFooter>
    </form>
  );
}
