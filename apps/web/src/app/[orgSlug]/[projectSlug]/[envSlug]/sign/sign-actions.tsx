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
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  cancelSignRequestAction,
  createSignTemplateAction,
  deleteSignRequestAction,
  deleteSignTemplateAction,
  openSignBuilderAction,
  remindSignRequestAction,
  saveSignSettingsAction,
} from "./actions";

export type EnvTarget = { orgSlug: string; projectSlug: string; envSlug: string };

function Hidden(props: EnvTarget & { requestId?: string; templateId?: string }) {
  return (
    <>
      {Object.entries(props).map(([name, value]) =>
        value ? <input key={name} name={name} type="hidden" value={value} /> : null,
      )}
    </>
  );
}

/**
 * A builder link to click (its token is in the fragment, never in a request). Not opened for
 * the member: a popup after an awaited action is blocked by most browsers.
 */
function BuilderLink({ url }: { url: string }) {
  return (
    <Button render={<a href={url} rel="noopener noreferrer" target="_blank" />} size="sm">
      Open the builder
    </Button>
  );
}

export function RemindButton(props: EnvTarget & { requestId: string }) {
  const [, formAction, pending] = useActionToast(remindSignRequestAction, {
    success: "Reminders on their way",
    errors: "toast",
  });
  return (
    <form action={formAction}>
      <Hidden {...props} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        Remind signers
      </Button>
    </form>
  );
}

export function CancelRequestButton(props: EnvTarget & { requestId: string; title: string }) {
  const [state, formAction, pending] = useActionToast(cancelSignRequestAction, {
    success: "Request canceled",
  });
  const { title, ...target } = props;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Cancel request
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Nobody can sign it after this. Signers who already signed keep nothing new.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {state && !state.ok ? <FormError message={state.error} /> : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Cancel request
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function DeleteRequestButton(props: EnvTarget & { requestId: string; title: string }) {
  const [state, formAction, pending] = useActionToast(deleteSignRequestAction, {
    success: "Request deleted",
  });
  const { title, ...target } = props;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its signers, audit trail, signatures and signed document are deleted for good.
              Download the signed document first if you need it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {state && !state.ok ? <FormError message={state.error} /> : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function NewTemplateButton(props: EnvTarget) {
  const [state, formAction, pending] = useActionToast(createSignTemplateAction, {
    success: "Template created",
  });
  const url = state?.ok ? state.data?.url : undefined;
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>New template</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
            <DialogDescription>
              Then open it in the builder (a new tab) to add PDFs, signers and fields.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input maxLength={200} name="name" placeholder="Mutual NDA" required />
            </Field>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>
              {url ? "Close" : "Cancel"}
            </DialogClose>
            {url ? (
              <BuilderLink url={url} />
            ) : (
              <Button loading={pending} type="submit">
                Create
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function OpenBuilderButton(props: EnvTarget & { templateId: string }) {
  const [state, formAction, pending] = useActionToast(openSignBuilderAction, {
    errors: "toast",
  });
  // Each link is good for an hour: get one, then open it.
  if (state?.ok) return <BuilderLink url={state.data.url} />;
  return (
    <form action={formAction}>
      <Hidden {...props} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        Edit
      </Button>
    </form>
  );
}

export function DeleteTemplateButton(props: EnvTarget & { templateId: string; name: string }) {
  const [state, formAction, pending] = useActionToast(deleteSignTemplateAction, {
    success: "Template deleted",
  });
  const { name, ...target } = props;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>Delete</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests made from it stay, and so do its documents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {state && !state.ok ? <FormError message={state.error} /> : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function SignSettingsForm(
  props: EnvTarget & {
    sandbox: boolean;
    defaultDisclosure: string;
    settings: {
      allowedOrigins: string[];
      displayName: string | null;
      accentColor: string | null;
      theme: string;
      disclosure: string | null;
      emailFrom: string | null;
      reminderIntervalDays: number | null;
    };
  },
) {
  const [state, formAction, pending] = useActionToast(saveSignSettingsAction, {
    success: "Sign settings saved",
  });
  const { settings, sandbox, defaultDisclosure, ...target } = props;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Hidden {...target} />
      <Field>
        <FieldLabel>Sites allowed to embed the signing page and builder</FieldLabel>
        <Textarea
          className="font-mono text-xs"
          defaultValue={settings.allowedOrigins.join("\n")}
          name="allowedOrigins"
          placeholder="https://app.example.com"
          rows={4}
        />
        <FieldDescription>
          One origin per line (https://, no path{sandbox ? "; http://localhost works here" : ""}).
          Without any, signing links only open as their own page.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Display name</FieldLabel>
        <Input
          defaultValue={settings.displayName ?? ""}
          maxLength={64}
          name="displayName"
          placeholder="Your organization's name"
        />
        <FieldDescription>Who signers are told is asking them to sign.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Signing emails come from</FieldLabel>
        <Input
          defaultValue={settings.emailFrom ?? ""}
          name="emailFrom"
          placeholder="contracts@yourdomain.com"
          type="email"
        />
        <FieldDescription>
          An address on one of your verified domains. Empty: coss.com sends them as “
          {settings.displayName ?? "Your organization"} via coss.com”.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Remind email signers every (days)</FieldLabel>
        <Input
          defaultValue={settings.reminderIntervalDays ?? ""}
          max={30}
          min={1}
          name="reminderIntervalDays"
          placeholder="No reminders"
          type="number"
        />
        <FieldDescription>For new requests, up to three reminders. Empty: none.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Accent color</FieldLabel>
        <Input defaultValue={settings.accentColor ?? ""} name="accentColor" placeholder="#2563eb" />
      </Field>
      <Field>
        <FieldLabel>Theme</FieldLabel>
        <RadioGroup aria-label="Theme" defaultValue={settings.theme} name="theme">
          {[
            ["system", "Follow the signer's system"],
            ["light", "Light"],
            ["dark", "Dark"],
          ].map(([value, label]) => (
            <Label key={value}>
              <Radio value={value} />
              {label}
            </Label>
          ))}
        </RadioGroup>
      </Field>
      <Field>
        <FieldLabel>Consent to sign electronically</FieldLabel>
        <Textarea
          defaultValue={settings.disclosure ?? ""}
          name="disclosure"
          placeholder={defaultDisclosure}
          rows={10}
        />
        <FieldDescription>
          Signers accept this before they see a document. Empty: coss.com's default (shown). Have
          your counsel review your own; {"{name}"} is replaced by the display name.
        </FieldDescription>
      </Field>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} type="submit">
          Save settings
        </Button>
      </div>
    </form>
  );
}
