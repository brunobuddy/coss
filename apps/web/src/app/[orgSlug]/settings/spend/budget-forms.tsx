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
import { Label } from "@coss/ui/components/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { GaugeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { MoneyInput } from "@/components/fields/money-input";
import { ThresholdPicker } from "@/components/fields/threshold-picker";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { deleteBudgetAction, setBudgetAction } from "./actions";

export type BudgetScope = "member_default" | "user" | "project" | "api_key";

/**
 * Sets a budget: of a fixed target (`targetId`), or of one picked from `targets` (projects or
 * API keys without one yet). Members' budgets can instead exempt them from the default.
 */
export function BudgetDialog(props: {
  orgSlug: string;
  scope: BudgetScope;
  targetId?: string;
  targets?: { value: string; label: string }[];
  /** Who it is for, in the title ("Ada Lovelace", "the Web project"). */
  title: string;
  description: string;
  trigger: string;
  triggerVariant?: "outline" | "default";
  amount?: string;
  thresholds?: string;
  exempt?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button
            size={props.triggerVariant === "default" ? "sm" : "xs"}
            variant={props.triggerVariant ?? "outline"}
          />
        }
      >
        {props.trigger}
      </DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <BudgetForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function BudgetForm(props: Parameters<typeof BudgetDialog>[0] & { onDone: () => void }) {
  const { onDone } = props;
  const [state, formAction, pending] = useActionToast(setBudgetAction, {
    success: "Budget saved",
  });
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const [exempt, setExempt] = useState(props.exempt ?? false);

  return (
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="scope" type="hidden" value={props.scope} />
      {props.targetId ? <input name="targetId" type="hidden" value={props.targetId} /> : null}
      <input name="exempt" type="hidden" value={String(exempt)} />
      <DialogHeader>
        <DialogIcon icon={GaugeIcon} />
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        {props.targets ? (
          <Field>
            <FieldLabel>For</FieldLabel>
            <Select items={props.targets} name="targetId">
              <SelectTrigger>
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectPopup>
                {props.targets.map((target) => (
                  <SelectItem key={target.value} value={target.value}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
        ) : null}
        {props.scope === "user" ? (
          <Label className="font-normal">
            <Checkbox checked={exempt} onCheckedChange={(checked) => setExempt(checked === true)} />
            No budget: exempt them from the default
          </Label>
        ) : null}
        {exempt ? null : (
          <>
            <Field>
              <FieldLabel>Monthly budget</FieldLabel>
              <MoneyInput
                autoFocus
                defaultValue={props.amount}
                name="amount"
                placeholder="50.00"
                required
              />
              <FieldDescription>
                Their share of the month's usage charges. Over it, their live sending pauses until
                next month or a higher budget; $0 allows no billable usage.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Email alerts at</FieldLabel>
              <ThresholdPicker
                defaultValue={props.thresholds}
                name="alertThresholds"
                presets={[50, 75, 80, 90, 100]}
              />
              <FieldDescription>
                The billing contacts (and the member it concerns) hear when spend reaches each mark.
              </FieldDescription>
            </Field>
          </>
        )}
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Save budget
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Removes a budget (a member's own: they're back on the default). */
export function RemoveBudgetButton(props: {
  orgSlug: string;
  budgetId: string;
  title: string;
  description: string;
}) {
  const [state, formAction, pending] = useActionToast(deleteBudgetAction, {
    success: "Budget removed",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="ghost" />}>Remove</AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <input name="budgetId" type="hidden" value={props.budgetId} />
          <AlertDialogHeader>
            <DialogIcon icon={GaugeIcon} tone="danger" />
            <AlertDialogTitle>{props.title}</AlertDialogTitle>
            <AlertDialogDescription>{props.description}</AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Remove budget
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
