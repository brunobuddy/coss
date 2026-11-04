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
import { Radio, RadioGroup } from "@coss/ui/components/radio-group";
import { Textarea } from "@coss/ui/components/textarea";
import { CalendarCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  createDelegationAction,
  deleteDelegationAction,
  updateDelegationAction,
  verifyDelegationAction,
} from "../actions";

type EnvTarget = { orgSlug: string; projectSlug: string; envSlug: string };
type Provider = "google" | "microsoft";

function Hidden(props: EnvTarget & Record<string, string | undefined>) {
  return (
    <>
      {Object.entries(props).map(([name, value]) =>
        value ? <input key={name} name={name} type="hidden" value={value} /> : null,
      )}
    </>
  );
}

function MatchHostEmailField(props: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox
          checked={props.checked}
          name="matchHostEmail"
          onCheckedChange={props.onCheckedChange}
        />
        Connect hosts by their email
      </Label>
      <p className="text-muted-foreground text-sm">
        Turn this off if your users can type their own email into your app. Otherwise someone could
        name a colleague's address and reach that calendar. With it off, only hosts you give a{" "}
        <code className="font-mono text-xs">calendar_account</code> connect.
      </p>
    </div>
  );
}

export function NewDelegationDialog(props: EnvTarget) {
  const [state, formAction, pending] = useActionToast(createDelegationAction, {
    success: "Delegation added",
  });
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("google");
  // React resets uncontrolled fields after an action, and a refused domain shouldn't lose a pasted key.
  const [values, setValues] = useState<Record<string, string>>({});
  const [matchHostEmail, setMatchHostEmail] = useState(true);
  const bind = (name: string) => ({
    name,
    value: values[name] ?? "",
    onChange: (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  });
  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      setValues({});
      setMatchHostEmail(true);
    }
  }, [state]);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Add delegation</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <DialogHeader>
            <DialogIcon icon={CalendarCheckIcon} />
            <DialogTitle>Add a delegation</DialogTitle>
            <DialogDescription>
              Your own credentials, which only reach your own Workspace or tenant. You'll authorize
              them next, and nothing is connected until you've verified them.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <RadioGroup
              name="provider"
              onValueChange={(value) => setProvider(value as Provider)}
              value={provider}
            >
              <Label className="flex items-center gap-2 font-normal">
                <Radio value="google" />
                Google Workspace
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <Radio value="microsoft" />
                Microsoft 365
              </Label>
            </RadioGroup>
            <Field>
              <FieldLabel>Domain</FieldLabel>
              <Input {...bind("domain")} placeholder="example.com" required />
              <FieldDescription>
                Hosts on exactly this domain connect, not its subdomains.
              </FieldDescription>
            </Field>
            {provider === "google" ? (
              <Field>
                <FieldLabel>Service account key</FieldLabel>
                <Textarea {...bind("serviceAccountKey")} className="font-mono" required rows={5} />
                <FieldDescription>
                  The whole JSON key of a service account in your Google Cloud project, with the
                  Calendar API enabled. It's encrypted, and never shown again.
                </FieldDescription>
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel>Directory (tenant) ID</FieldLabel>
                  <Input {...bind("tenantId")} required />
                </Field>
                <Field>
                  <FieldLabel>Application (client) ID</FieldLabel>
                  <Input {...bind("clientId")} required />
                </Field>
                <Field>
                  <FieldLabel>Client secret</FieldLabel>
                  <Input {...bind("clientSecret")} autoComplete="off" required type="password" />
                  <FieldDescription>It's encrypted, and never shown again.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Secret expires</FieldLabel>
                  <Input {...bind("secretExpiresAt")} type="date" />
                  <FieldDescription>Owners and admins are warned 14 days before.</FieldDescription>
                </Field>
              </>
            )}
            <MatchHostEmailField checked={matchHostEmail} onCheckedChange={setMatchHostEmail} />
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending} type="submit">
              Add delegation
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function VerifyDelegationForm(props: EnvTarget & { delegationId: string; domain: string }) {
  const { domain, ...target } = props;
  const [state, formAction, pending] = useActionToast(verifyDelegationAction, {
    success: "Delegation verified",
  });
  // A refusal can just mean the authorization hasn't applied yet, so this gets tried again.
  const [account, setAccount] = useState("");
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Hidden {...target} />
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-64 flex-1">
          <FieldLabel>Mailbox to try</FieldLabel>
          <Input
            name="account"
            onChange={(event) => setAccount(event.target.value)}
            placeholder={`someone@${domain}`}
            required
            type="email"
            value={account}
          />
        </Field>
        <Button disabled={pending} type="submit">
          Verify
        </Button>
      </div>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}

export function EditDelegationDialog(
  props: EnvTarget & {
    delegationId: string;
    domain: string;
    provider: Provider;
    matchHostEmail: boolean;
    secretExpiresAt: string | null;
  },
) {
  const { domain, provider, matchHostEmail, secretExpiresAt, ...target } = props;
  const [state, formAction, pending] = useActionToast(updateDelegationAction, {
    success: "Delegation updated",
  });
  const [open, setOpen] = useState(false);
  const [match, setMatch] = useState(matchHostEmail);
  const [credential, setCredential] = useState("");
  const [expires, setExpires] = useState(secretExpiresAt?.slice(0, 10) ?? "");
  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      setCredential("");
    }
  }, [state]);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>Edit</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <DialogHeader>
            <DialogTitle>Edit {domain}</DialogTitle>
            <DialogDescription>
              New credentials are tried on the verified mailbox before they replace the old ones.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <MatchHostEmailField checked={match} onCheckedChange={setMatch} />
            {provider === "google" ? (
              <Field>
                <FieldLabel>New service account key</FieldLabel>
                <Textarea
                  className="font-mono"
                  name="serviceAccountKey"
                  onChange={(event) => setCredential(event.target.value)}
                  rows={5}
                  value={credential}
                />
                <FieldDescription>Leave it empty to keep the current one.</FieldDescription>
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel>New client secret</FieldLabel>
                  <Input
                    autoComplete="off"
                    name="clientSecret"
                    onChange={(event) => setCredential(event.target.value)}
                    type="password"
                    value={credential}
                  />
                  <FieldDescription>Leave it empty to keep the current one.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Secret expires</FieldLabel>
                  <Input
                    name="secretExpiresAt"
                    onChange={(event) => setExpires(event.target.value)}
                    type="date"
                    value={expires}
                  />
                </Field>
              </>
            )}
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending} type="submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function DeleteDelegationButton(
  props: EnvTarget & { delegationId: string; domain: string; hosts: number },
) {
  const { domain, hosts, ...target } = props;
  const [state, formAction, pending] = useActionToast(deleteDelegationAction, {
    success: "Delegation deleted",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>Delete</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the delegation for {domain}?</AlertDialogTitle>
            <AlertDialogDescription>
              {hosts === 1 ? "1 host loses" : `${hosts} hosts lose`} conflict checks and stay
              bookable, so they could be booked over their meetings. Events stay on their calendars,
              and later moves or cancellations won't reach them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep</AlertDialogClose>
            <Button disabled={pending} type="submit" variant="destructive">
              Delete delegation
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
