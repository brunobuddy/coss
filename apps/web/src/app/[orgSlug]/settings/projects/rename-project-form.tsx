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
import { PencilIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { renameProjectAction } from "./actions";

/** A project tile's pencil: a dialog that renames the project (its slug and URLs stay). */
export function RenameProjectDialog({
  orgSlug,
  project,
  maxLength,
}: {
  orgSlug: string;
  project: { id: string; name: string; slug: string };
  /** `PROJECT_NAME_MAX_LENGTH`, passed in: `@coss/tenancy` is server-only. */
  maxLength: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        aria-label={`Rename ${project.name}`}
        render={<Button size="icon-sm" variant="ghost" />}
      >
        <PencilIcon />
      </DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form state. */}
        <RenameProjectForm
          maxLength={maxLength}
          onDone={() => setOpen(false)}
          orgSlug={orgSlug}
          project={project}
        />
      </DialogPopup>
    </Dialog>
  );
}

function RenameProjectForm({
  orgSlug,
  project,
  maxLength,
  onDone,
}: {
  orgSlug: string;
  project: { id: string; name: string; slug: string };
  maxLength: number;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionToast(renameProjectAction, {
    success: "Project renamed",
  });

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <input name="projectId" type="hidden" value={project.id} />
      <DialogHeader>
        <DialogTitle>Rename project</DialogTitle>
        <DialogDescription>
          The slug stays <span className="font-mono">{project.slug}</span>, so dashboard links keep
          working. API keys are unaffected.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input autoFocus defaultValue={project.name} maxLength={maxLength} name="name" required />
          <FieldDescription>Up to {maxLength} characters.</FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Rename
        </Button>
      </DialogFooter>
    </form>
  );
}
