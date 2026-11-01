"use client";

import { Alert, AlertDescription } from "@coss/ui/components/alert";
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
import {
  addReceivingDomainAction,
  checkReceivingDomainAction,
  removeReceivingDomainAction,
  type VerifyOutcome,
} from "../actions";

type Target = { orgSlug: string; domainId: string };

export type EnvironmentOption = { value: string; label: string };

function TargetInputs(props: Target) {
  return (
    <>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="domainId" type="hidden" value={props.domainId} />
    </>
  );
}

export function AddReceivingDomainDialog(
  props: Target & { domainName: string; environments: EnvironmentOption[] },
) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Receive email</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <AddReceivingDomainForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function AddReceivingDomainForm(
  props: Target & { domainName: string; environments: EnvironmentOption[]; onDone: () => void },
) {
  const [hostname, setHostname] = useState(`inbound.${props.domainName}`);
  const [state, formAction, pending] = useActionToast(addReceivingDomainAction, {
    success: {
      title: "Receiving set up",
      description: `Publish its MX record, then email to any address at ${hostname} is received.`,
    },
  });
  const { onDone } = props;

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const apex = hostname.trim().toLowerCase().replace(/\.$/, "") === props.domainName;
  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogTitle>Receive email</DialogTitle>
        <DialogDescription>
          Email sent to any address at this hostname becomes a received email of the environment: an{" "}
          <code>email.received</code> webhook, and the email in the dashboard and the API.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Hostname</FieldLabel>
          <Input
            autoFocus
            name="hostname"
            onChange={(event) => setHostname(event.target.value)}
            required
            value={hostname}
          />
          <FieldDescription>
            {props.domainName} itself, or a subdomain of it that has no mail server of its own.
          </FieldDescription>
        </Field>
        {apex ? (
          <Alert variant="warning">
            <AlertDescription>
              Pointing {props.domainName}&apos;s MX at coss.com moves all of its mail here,
              including your team&apos;s mailboxes. Use a subdomain unless that is what you want.
            </AlertDescription>
          </Alert>
        ) : null}
        <Field>
          <FieldLabel>Environment</FieldLabel>
          <Select
            defaultValue={props.environments[0]?.value}
            items={props.environments}
            name="environmentId"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {props.environments.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <FieldDescription>Its webhooks and API keys see the received emails.</FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Receive email
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CheckReceivingDomainButton(props: Target) {
  const [, formAction, pending] = useActionToast(checkReceivingDomainAction, {
    success: receivingCheckToast,
    errors: "toast",
  });

  return (
    <form action={formAction}>
      <TargetInputs {...props} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        Check now
      </Button>
    </form>
  );
}

function receivingCheckToast({ status }: VerifyOutcome) {
  if (status === "verified") return "MX record found";
  return {
    type: status === "mismatch" ? "warning" : "info",
    title: status === "mismatch" ? "MX record points elsewhere" : "MX record not found yet",
    description: "We keep checking automatically; DNS changes can take a while to spread.",
  } as const;
}

export function RemoveReceivingDomainButton(props: Target & { hostname: string }) {
  const [state, formAction, pending] = useActionToast(removeReceivingDomainAction, {
    success: `Stopped receiving at ${props.hostname}`,
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Stop receiving
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Stop receiving at {props.hostname}?</AlertDialogTitle>
            <AlertDialogDescription>
              Email sent to {props.hostname} from now on is dropped. Remove its MX record too.
              Emails already received are kept until their retention period ends.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Stop receiving
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
