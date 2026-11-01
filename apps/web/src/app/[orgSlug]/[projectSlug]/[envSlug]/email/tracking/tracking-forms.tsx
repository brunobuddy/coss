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
import { Checkbox } from "@coss/ui/components/checkbox";
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
import { Label } from "@coss/ui/components/label";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { deleteTrackingRuleAction, saveTrackingRuleAction } from "./actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };
type Setting = { opens: boolean; clicks: boolean; unsubscribe: boolean };

function TargetInputs(props: Target) {
  return (
    <>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
    </>
  );
}

function TrackingCheckboxes(props: Setting & { disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <Label>
        <Checkbox defaultChecked={props.opens} disabled={props.disabled} name="opens" value="on" />
        <span>
          Track opens{" "}
          <span className="text-muted-foreground">(adds an invisible image to the HTML)</span>
        </span>
      </Label>
      <Label>
        <Checkbox
          defaultChecked={props.clicks}
          disabled={props.disabled}
          name="clicks"
          value="on"
        />
        <span>
          Track clicks{" "}
          <span className="text-muted-foreground">(sends links through a coss.com redirect)</span>
        </span>
      </Label>
      <Label>
        <Checkbox
          defaultChecked={props.unsubscribe}
          disabled={props.disabled}
          name="unsubscribe"
          value="on"
        />
        <span>
          One-click unsubscribe{" "}
          <span className="text-muted-foreground">
            (adds List-Unsubscribe headers; unsubscribing suppresses the category)
          </span>
        </span>
      </Label>
    </div>
  );
}

/** The environment default; read-only (disabled) without `environment:update`. */
export function DefaultTrackingForm(props: Target & Setting & { canEdit: boolean }) {
  const [state, formAction, pending] = useActionToast(saveTrackingRuleAction, {
    success: "Tracking default saved",
  });
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TargetInputs {...props} />
      <TrackingCheckboxes
        clicks={props.clicks}
        disabled={!props.canEdit}
        opens={props.opens}
        unsubscribe={props.unsubscribe}
      />
      {state && !state.ok ? <FormError message={state.error} /> : null}
      {props.canEdit ? (
        <div>
          <Button loading={pending} size="sm" type="submit">
            Save default
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/** Adds a category rule, or edits one when `category` is given (the category is then fixed). */
export function CategoryRuleDialog(
  props: Target & Partial<Setting> & { category?: string; trigger: "add" | "edit" },
) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          props.trigger === "add" ? <Button size="sm" /> : <Button size="xs" variant="outline" />
        }
      >
        {props.trigger === "add" ? "Add category rule" : "Edit"}
      </DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <CategoryRuleForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function CategoryRuleForm(
  props: Target & Partial<Setting> & { category?: string; onDone: () => void },
) {
  const [state, formAction, pending] = useActionToast(saveTrackingRuleAction, {
    success: {
      title: "Tracking rule saved",
      description: "New emails in this category use it; emails already sent keep theirs.",
    },
  });
  const editing = props.category !== undefined;
  const { onDone } = props;
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogTitle>
          {editing ? `Tracking for “${props.category}”` : "Add a category rule"}
        </DialogTitle>
        <DialogDescription>
          Emails sent with this <code>category</code> use these settings instead of the environment
          default. A send&apos;s own <code>tracking</code> option still wins.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        {editing ? (
          <input name="category" type="hidden" value={props.category} />
        ) : (
          <Field>
            <FieldLabel>Category</FieldLabel>
            <Input autoFocus maxLength={256} name="category" placeholder="marketing" required />
            <FieldDescription>
              ASCII letters, numbers, underscores or dashes, as sent in <code>category</code>.
            </FieldDescription>
          </Field>
        )}
        <TrackingCheckboxes
          clicks={props.clicks ?? false}
          opens={props.opens ?? false}
          unsubscribe={props.unsubscribe ?? false}
        />
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Save rule
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteTrackingRuleButton(
  props: Target & { ruleId: string; category: string | null },
) {
  // On success the page re-renders without this rule, which unmounts the dialog.
  const isDefault = props.category === null;
  const [state, formAction, pending] = useActionToast(deleteTrackingRuleAction, {
    success: isDefault ? "Tracking default reset" : `${props.category} rule removed`,
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="destructive-outline" />}>
        {isDefault ? "Reset" : "Remove"}
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <input name="ruleId" type="hidden" value={props.ruleId} />
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isDefault ? "Reset the default?" : `Remove the “${props.category}” rule?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isDefault
                ? "Tracking and one-click unsubscribe will be off for emails without a category rule (unless a send asks for them)."
                : "Emails in this category will use the environment default."}{" "}
              Emails already sent are not affected.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              {isDefault ? "Reset default" : "Remove rule"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
