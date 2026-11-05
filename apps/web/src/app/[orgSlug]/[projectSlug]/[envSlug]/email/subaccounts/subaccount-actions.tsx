"use client";

import { MAX_SUBACCOUNT_QUOTA } from "@coss/email/subaccount-schemas";
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
import { UsersRoundIcon } from "lucide-react";
import Link from "next/link";
import { DialogIcon } from "@/components/dialog-icon";
import { UnitInput } from "@/components/fields/unit-input";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  createSubaccountAction,
  deleteSubaccountAction,
  reinstateSubaccountAction,
  saveSubaccountQuotasAction,
  setSubaccountStatusAction,
} from "./actions";

export type EnvTarget = { orgSlug: string; projectSlug: string; envSlug: string };
type SubaccountTarget = EnvTarget & { subaccountId: string };

function Hidden(props: Record<string, string>) {
  return (
    <>
      {Object.entries(props).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
    </>
  );
}

export function CreateSubaccountDialog(props: EnvTarget) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Add sub-account</DialogTrigger>
      <DialogPopup>
        <CreateSubaccountForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function CreateSubaccountForm(props: EnvTarget) {
  const [state, formAction, pending] = useActionToast(createSubaccountAction, {
    success: "Sub-account added",
  });
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogIcon icon={UsersRoundIcon} />
          <DialogTitle>Sub-account added</DialogTitle>
          <DialogDescription>
            Send for it with its id or uid (<code>subaccount</code>), and give it its own domains.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            render={
              <Link
                href={`/${props.orgSlug}/${props.projectSlug}/${props.envSlug}/email/subaccounts/${state.data.id}`}
              />
            }
          >
            View sub-account
          </Button>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={formAction} className="contents">
      <Hidden {...props} />
      <DialogHeader>
        <DialogIcon icon={UsersRoundIcon} />
        <DialogTitle>Add a sub-account</DialogTitle>
        <DialogDescription>
          One of your users: their own domains, suppressions, quotas and reputation.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input autoFocus maxLength={256} name="name" placeholder="Acme Bakery" required />
        </Field>
        <Field>
          <FieldLabel>UID</FieldLabel>
          <Input maxLength={256} name="uid" placeholder="Optional, e.g. user_8812" />
          <FieldDescription>
            Your own id for it, to name it by in sends and the API instead of its id.
          </FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Add sub-account
        </Button>
      </DialogFooter>
    </form>
  );
}

export function QuotasForm(
  props: SubaccountTarget & {
    perDay: number | null;
    perSecond: number | null;
    burst: number | null;
  },
) {
  const { perDay, perSecond, burst, ...target } = props;
  const [state, formAction, pending] = useActionToast(saveSubaccountQuotasAction, {
    success: "Quotas saved",
  });
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Hidden {...target} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel>Recipients</FieldLabel>
          <UnitInput
            defaultValue={perDay ?? ""}
            max={MAX_SUBACCOUNT_QUOTA}
            min={1}
            name="perDay"
            placeholder="No limit"
            step={1}
            unit="per day"
          />
        </Field>
        <Field>
          <FieldLabel>Rate</FieldLabel>
          <UnitInput
            defaultValue={perSecond ?? ""}
            max={MAX_SUBACCOUNT_QUOTA}
            min={1}
            name="perSecond"
            placeholder="No limit"
            step={1}
            unit="per second"
          />
        </Field>
        <Field>
          <FieldLabel>Burst</FieldLabel>
          <UnitInput
            defaultValue={burst ?? ""}
            max={MAX_SUBACCOUNT_QUOTA}
            min={1}
            name="burst"
            placeholder="No limit"
            step={1}
            unit="recipients"
          />
        </Field>
      </div>
      <p className="text-muted-foreground text-sm">
        Empty means no quota of its own: only your organization's applies.
      </p>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} size="sm" type="submit">
          Save quotas
        </Button>
      </div>
    </form>
  );
}

export function StatusButton(props: SubaccountTarget & { disabled: boolean }) {
  const { disabled, ...target } = props;
  const [, formAction, pending] = useActionToast(setSubaccountStatusAction, {
    success: disabled ? "Sub-account enabled" : "Sub-account disabled",
    errors: "toast",
  });
  return (
    <form action={formAction}>
      <Hidden {...target} status={disabled ? "active" : "disabled"} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        {disabled ? "Enable" : "Disable"}
      </Button>
    </form>
  );
}

export function ReinstateButton(props: SubaccountTarget & { name: string }) {
  const { name, ...target } = props;
  const [state, formAction, pending] = useActionToast(reinstateSubaccountAction, {
    success: `${name} reinstated`,
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" />}>Reinstate</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <AlertDialogHeader>
            <DialogIcon icon={UsersRoundIcon} />
            <AlertDialogTitle>Reinstate {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its live sends are accepted again and its rates are measured from now on. Fix what
              paused it first: your organization's own reputation still counts its sending.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit">
              Reinstate
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function DeleteSubaccountButton(props: SubaccountTarget & { name: string }) {
  const { name, ...target } = props;
  const [state, formAction, pending] = useActionToast(deleteSubaccountAction, {
    success: `${name} deleted`,
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <AlertDialogHeader>
            <DialogIcon icon={UsersRoundIcon} tone="danger" />
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its sends are refused at once, then its domains are released and it is removed with
              its suppressions. Its emails stay. This can't be undone.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete sub-account
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
