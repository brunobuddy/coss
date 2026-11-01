"use client";

import type { LogDrainSource } from "@coss/logs/schemas";
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
import type { LogDrainFormat } from "@coss/webhooks/schemas";
import { useActionState, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  deleteLogDrainAction,
  revealLogDrainSecretAction,
  setLogDrainEnabledAction,
  updateLogDrainDeliveryAction,
  updateLogDrainSourcesAction,
} from "../actions";
import { AuthFields, FormatSelect } from "../delivery-fields";
import { SourceCheckboxes } from "../source-checkboxes";

type Target = { orgSlug: string; projectSlug: string; envSlug: string; drainId: string };

function TargetInputs(props: Target) {
  return (
    <>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="drainId" type="hidden" value={props.drainId} />
    </>
  );
}

export function ToggleDrainButton(props: Target & { enabled: boolean }) {
  const [state, formAction, pending] = useActionToast(setLogDrainEnabledAction, {
    success: props.enabled ? "Log drain disabled" : "Log drain enabled",
    // Enabling is one click with nowhere to show an error; disabling confirms in a dialog.
    errors: props.enabled ? "inline" : "toast",
  });
  if (!props.enabled) {
    return (
      <form action={formAction}>
        <TargetInputs {...props} />
        <input name="enabled" type="hidden" value="true" />
        <Button loading={pending} size="sm" type="submit" variant="outline">
          Enable
        </Button>
      </form>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
        Disable
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <input name="enabled" type="hidden" value="false" />
          <AlertDialogHeader>
            <AlertDialogTitle>Disable this log drain?</AlertDialogTitle>
            <AlertDialogDescription>
              Lines still waiting to be sent are dropped, and nothing is kept for the drain while it
              is disabled. Enabling it again sends lines logged from then on.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit">
              Disable
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function EditSourcesButton(props: Target & { sources: LogDrainSource[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Edit sources</DialogTrigger>
      <DialogPopup>
        <EditSourcesForm {...props} onSaved={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function EditSourcesForm(props: Target & { sources: LogDrainSource[]; onSaved: () => void }) {
  const [state, formAction, pending] = useActionToast(updateLogDrainSourcesAction, {
    success: "Sources saved",
  });
  const { onSaved } = props;
  useEffect(() => {
    if (state?.ok) onSaved();
  }, [state, onSaved]);
  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogTitle>Sources</DialogTitle>
        <DialogDescription>
          The kinds of lines this drain receives. With every source checked, it also receives
          sources added later.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <SourceCheckboxes selected={props.sources} />
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

type Delivery = { url: string; format: LogDrainFormat; authHeaderName: string | null };

export function EditDeliveryButton(props: Target & Delivery) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Edit delivery</DialogTrigger>
      <DialogPopup>
        <EditDeliveryForm {...props} onSaved={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function EditDeliveryForm(props: Target & Delivery & { onSaved: () => void }) {
  const [state, formAction, pending] = useActionToast(updateLogDrainDeliveryAction, {
    success: "Delivery saved",
  });
  const { onSaved } = props;
  useEffect(() => {
    if (state?.ok) onSaved();
  }, [state, onSaved]);
  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogTitle>Delivery</DialogTitle>
        <DialogDescription>
          Where batches go and how they are encoded. A batch being retried goes out with the new
          settings.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>URL</FieldLabel>
          <Input defaultValue={props.url} name="url" required type="url" />
          <FieldDescription>Must be https:// and publicly reachable.</FieldDescription>
        </Field>
        <FormatSelect defaultValue={props.format} />
        <AuthFields
          currentHeaderName={props.authHeaderName}
          defaultKind={props.authHeaderName ? "keep" : "none"}
        />
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

export function DeleteDrainButton(props: Target & { url: string }) {
  // On success the action redirects to the drain list.
  const [state, formAction, pending] = useActionToast(deleteLogDrainAction, {
    success: "Log drain deleted",
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
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this log drain?</AlertDialogTitle>
            <AlertDialogDescription>
              {props.url} will stop receiving logs, and lines still waiting for it are dropped. This
              can't be undone.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete log drain
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function RevealDrainSecret(props: Target) {
  const [state, formAction, pending] = useActionState(revealLogDrainSecretAction, null);
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-2">
        <code className="block select-all break-all rounded-lg border bg-muted px-3 py-2 font-mono text-sm">
          {state.data.secret}
        </code>
        <div>
          <CopyButton label="Copy secret" value={state.data.secret} />
        </div>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <TargetInputs {...props} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        Reveal signing secret
      </Button>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}
