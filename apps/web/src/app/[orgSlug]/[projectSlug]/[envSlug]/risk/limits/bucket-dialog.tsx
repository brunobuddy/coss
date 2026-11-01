"use client";

import type { RiskLimitBucketOutput } from "@coss/risk/schemas";
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
import { deleteRiskLimitBucketAction, saveRiskLimitBucketAction } from "../actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

const PERIODS = [
  { value: "1", label: "per second" },
  { value: "60", label: "per minute" },
  { value: "3600", label: "per hour" },
  { value: "86400", label: "per day" },
];

const FAILURE_MODES = [
  { value: "allow", label: "Allow (fail open)" },
  { value: "deny", label: "Deny (fail closed)" },
];

function Hidden(props: Target & { bucketId?: string }) {
  return (
    <>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      {props.bucketId ? <input name="bucketId" type="hidden" value={props.bucketId} /> : null}
    </>
  );
}

/** Creates a bucket, or edits `bucket` (everything but its name). */
export function BucketDialog(props: Target & { bucket?: RiskLimitBucketOutput }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={props.bucket ? <Button size="xs" variant="outline" /> : <Button size="sm" />}
      >
        {props.bucket ? "Edit" : "New bucket"}
      </DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <BucketForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function BucketForm(props: Target & { bucket?: RiskLimitBucketOutput; onDone: () => void }) {
  const { bucket, onDone } = props;
  const [state, formAction, pending] = useActionToast(saveRiskLimitBucketAction, {
    success: bucket ? `${bucket.name} saved` : "Bucket created",
  });
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  // A bucket's period that isn't one of the presets (set over the API) stays selectable.
  const periods = PERIODS.some((period) => Number(period.value) === bucket?.period_seconds)
    ? PERIODS
    : bucket
      ? [
          ...PERIODS,
          { value: String(bucket.period_seconds), label: `per ${bucket.period_seconds} s` },
        ]
      : PERIODS;

  return (
    <form action={formAction} className="contents">
      <Hidden {...props} bucketId={bucket?.id} />
      <DialogHeader>
        <DialogTitle>{bucket ? `Edit ${bucket.name}` : "New rate limit bucket"}</DialogTitle>
        <DialogDescription>
          Each key you check against it gets its own bucket of tokens, refilling at the rate.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        {bucket ? null : (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input
              autoFocus
              maxLength={64}
              name="name"
              pattern="[a-z0-9][a-z0-9._\-]{0,63}"
              placeholder="password_reset"
              required
            />
            <FieldDescription>
              What your code names it by. Lower-case letters, digits, <code>.</code>, <code>_</code>{" "}
              and <code>-</code>; it can't be changed later.
            </FieldDescription>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Rate</FieldLabel>
            <Input
              defaultValue={bucket?.limit ?? 10}
              max={1_000_000}
              min={1}
              name="limit"
              required
              type="number"
            />
          </Field>
          <Field>
            <FieldLabel>Period</FieldLabel>
            <Select
              defaultValue={String(bucket?.period_seconds ?? 60)}
              items={periods}
              name="periodSeconds"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {periods.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel>Burst</FieldLabel>
          <Input
            defaultValue={bucket?.burst}
            max={1_000_000}
            min={1}
            name="burst"
            placeholder="Same as the rate"
            type="number"
          />
          <FieldDescription>How many requests a key can make at once.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>While coss.com can't count</FieldLabel>
          <Select
            defaultValue={bucket?.on_failure ?? "allow"}
            items={FAILURE_MODES}
            name="onFailure"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {FAILURE_MODES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          {bucket ? "Save bucket" : "Create bucket"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteBucketButton(props: Target & { bucketId: string; name: string }) {
  // On success the page re-renders without this bucket, which unmounts the dialog.
  const [state, formAction, pending] = useActionToast(deleteRiskLimitBucketAction, {
    success: `${props.name} deleted`,
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{props.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Checks naming it fail with a 404 until you create it again, which starts every key
              with a full bucket.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete bucket
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
