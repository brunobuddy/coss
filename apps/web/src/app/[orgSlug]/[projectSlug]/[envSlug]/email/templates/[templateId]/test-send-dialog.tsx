"use client";

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
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import Link from "next/link";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { sendTestAction } from "../actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string; templateId: string };

type Props = {
  target: Target;
  revision: number;
  locales: string[];
  sample: Record<string, unknown>;
  /** Verified members' addresses: the only recipients allowed. */
  recipients: string[];
  currentUserEmail: string;
  from: string;
  sandbox: boolean;
  emailsPath: string;
  /** Why it can't send right now (unsaved changes). */
  blocked: string | null;
};

/** Sends the saved draft, with the sample values, to members of the organization. */
export function TestSendDialog(props: Props) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Send test</DialogTrigger>
      <DialogPopup>
        <TestSendForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function TestSendForm(props: Props) {
  const [state, formAction, pending] = useActionState(sendTestAction, null);
  const [locale, setLocale] = useState(props.locales[0] ?? "");
  const [to, setTo] = useState<Set<string>>(
    new Set(props.recipients.includes(props.currentUserEmail) ? [props.currentUserEmail] : []),
  );

  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Test sent</DialogTitle>
          <DialogDescription>
            {props.sandbox
              ? "The environment is a sandbox: nothing is delivered, but the email shows what would be."
              : "It is on its way to the members you chose."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            render={<Link href={`${props.emailsPath}/${state.data.emailId}`} />}
            variant="outline"
          >
            View email
          </Button>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }

  return (
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={props.target.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.target.projectSlug} />
      <input name="envSlug" type="hidden" value={props.target.envSlug} />
      <input name="templateId" type="hidden" value={props.target.templateId} />
      <input name="revision" type="hidden" value={props.revision} />
      <input name="locale" type="hidden" value={locale} />
      <input name="variables" type="hidden" value={JSON.stringify(props.sample)} />
      {[...to].map((address) => (
        <input key={address} name="to" type="hidden" value={address} />
      ))}
      <DialogHeader>
        <DialogTitle>Send a test</DialogTitle>
        <DialogDescription>
          The saved draft, rendered with the sample values, goes out like any send of this
          environment (and counts against its quota).
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        {props.blocked ? <FormError message={props.blocked} /> : null}
        <Field>
          <FieldLabel>From</FieldLabel>
          <Input defaultValue={props.from} name="from" required />
          {props.sandbox ? null : (
            <FieldDescription>Must be on a verified domain of the organization.</FieldDescription>
          )}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium text-sm">To (members with a verified address)</legend>
          {props.recipients.map((address) => (
            <Label className="gap-2 font-normal" key={address}>
              <Checkbox
                checked={to.has(address)}
                onCheckedChange={(checked) =>
                  setTo((current) => {
                    const next = new Set(current);
                    if (checked) next.add(address);
                    else next.delete(address);
                    return next;
                  })
                }
              />
              {address}
            </Label>
          ))}
        </fieldset>
        {props.locales.length > 1 ? (
          <Field className="w-48">
            <FieldLabel>Locale</FieldLabel>
            <Select
              items={props.locales.map((value) => ({ value, label: value }))}
              onValueChange={(value) => setLocale(String(value))}
              value={locale}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {props.locales.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
        ) : null}
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button
          disabled={props.blocked !== null || to.size === 0 || to.size > 5}
          loading={pending}
          type="submit"
        >
          Send test
        </Button>
      </DialogFooter>
    </form>
  );
}
