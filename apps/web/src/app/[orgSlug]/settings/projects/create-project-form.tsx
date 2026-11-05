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
import { FolderIcon, PlusIcon } from "lucide-react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { createProjectAction } from "./actions";

/** "New project" in the page header: a dialog that creates the project and opens it. */
export function CreateProjectDialog({
  orgSlug,
  maxLength,
  variant = "default",
  defaultOpen,
}: {
  orgSlug: string;
  /** `PROJECT_NAME_MAX_LENGTH`, passed in: `@coss/tenancy` is server-only. */
  maxLength: number;
  variant?: "default" | "outline";
  /** Open on arrival (`?new=1`, the header's "New project"). */
  defaultOpen?: boolean;
}) {
  return (
    <Dialog defaultOpen={defaultOpen}>
      <DialogTrigger render={<Button size="sm" variant={variant} />}>
        <PlusIcon />
        New project
      </DialogTrigger>
      <DialogPopup>
        <CreateProjectForm maxLength={maxLength} orgSlug={orgSlug} />
      </DialogPopup>
    </Dialog>
  );
}

function CreateProjectForm({ orgSlug, maxLength }: { orgSlug: string; maxLength: number }) {
  const [state, formAction, pending] = useActionToast(createProjectAction, {
    success: "Project created",
  });

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <DialogHeader>
        <DialogIcon icon={FolderIcon} />
        <DialogTitle>New project</DialogTitle>
        <DialogDescription>
          A project gets a production (live) and a development (sandbox) environment, each with its
          own API keys.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input autoFocus maxLength={maxLength} name="name" placeholder="e.g. Web app" required />
          <FieldDescription>Up to {maxLength} characters.</FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Create project
        </Button>
      </DialogFooter>
    </form>
  );
}
