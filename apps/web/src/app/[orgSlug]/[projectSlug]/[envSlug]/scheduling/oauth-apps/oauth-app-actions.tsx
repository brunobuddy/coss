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
import { KeyRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { createOauthAppAction, deleteOauthAppAction, updateOauthAppAction } from "../actions";

type EnvTarget = { orgSlug: string; projectSlug: string; envSlug: string };
type Provider = "google" | "microsoft" | "zoom";

function Hidden(props: EnvTarget & Record<string, string | undefined>) {
  return (
    <>
      {Object.entries(props).map(([name, value]) =>
        value ? <input key={name} name={name} type="hidden" value={value} /> : null,
      )}
    </>
  );
}

/** The fields an app and an edit share. React resets uncontrolled ones after an action. */
function AddressFields(props: {
  provider: Provider;
  bind: (name: string) => {
    name: string;
    value: string;
    onChange: (event: { target: { value: string } }) => void;
  };
}) {
  const { provider, bind } = props;
  return (
    <>
      {provider === "microsoft" ? (
        <Field>
          <FieldLabel>Directory (tenant) ID</FieldLabel>
          <Input {...bind("tenantId")} />
          <FieldDescription>
            Only for an app limited to your own tenant. Leave it empty for a multi-tenant app.
          </FieldDescription>
        </Field>
      ) : null}
      <Field>
        <FieldLabel>Your forwarding page</FieldLabel>
        <Input {...bind("redirectUri")} placeholder="https://example.com/oauth/calendar" />
        <FieldDescription>
          {provider === "google"
            ? "Required for an external Google app, since Google verifies the redirect's domain as yours. It sends the browser on to coss.com's redirect URI, with the same query string."
            : "Optional. A page on your domain, registered as the redirect URI, that sends the browser on to coss.com's with the same query string."}
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>After consent</FieldLabel>
        <Input {...bind("completionUrl")} placeholder="https://example.com/calendar-connected" />
        <FieldDescription>
          Where the browser lands afterwards, unless a consent names its own. Empty: a plain page
          saying what happened.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Secret expires</FieldLabel>
        <Input {...bind("secretExpiresAt")} type="date" />
        <FieldDescription>Owners and admins are warned 14 days before.</FieldDescription>
      </Field>
    </>
  );
}

function useFormValues(initial: Record<string, string> = {}) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const bind = (name: string) => ({
    name,
    value: values[name] ?? "",
    onChange: (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  });
  return { bind, setValues };
}

export function NewOauthAppDialog(props: EnvTarget & { provider: Provider; name: string }) {
  const { provider, name, ...target } = props;
  const [state, formAction, pending] = useActionToast(createOauthAppAction, {
    success: "OAuth app added",
  });
  const [open, setOpen] = useState(false);
  const { bind, setValues } = useFormValues();
  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      setValues({});
    }
  }, [state, setValues]);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Use your own</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} provider={provider} />
          <DialogHeader>
            <DialogIcon icon={KeyRoundIcon} />
            <DialogTitle>Your own {name} app</DialogTitle>
            <DialogDescription>
              New consents in this environment use it. Hosts already connected stay on coss.com's
              app until they connect again.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Client ID</FieldLabel>
              <Input {...bind("clientId")} required />
            </Field>
            <Field>
              <FieldLabel>Client secret</FieldLabel>
              <Input {...bind("clientSecret")} autoComplete="off" required type="password" />
              <FieldDescription>
                It's tried with {name} first, encrypted, and never shown again.
              </FieldDescription>
            </Field>
            {provider === "zoom" ? (
              <Field>
                <FieldLabel>Secret Token</FieldLabel>
                <Input {...bind("webhookSecret")} autoComplete="off" type="password" />
                <FieldDescription>
                  From your Zoom app's Features page, to verify its deauthorization events.
                </FieldDescription>
              </Field>
            ) : null}
            <AddressFields bind={bind} provider={provider} />
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={pending} type="submit">
              Add app
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function EditOauthAppDialog(
  props: EnvTarget & {
    oauthAppId: string;
    provider: Provider;
    name: string;
    tenantId: string | null;
    redirectUri: string | null;
    completionUrl: string | null;
    secretExpiresAt: string | null;
  },
) {
  const { provider, name, tenantId, redirectUri, completionUrl, secretExpiresAt, ...target } =
    props;
  const [state, formAction, pending] = useActionToast(updateOauthAppAction, {
    success: "OAuth app updated",
  });
  const [open, setOpen] = useState(false);
  const { bind, setValues } = useFormValues({
    tenantId: tenantId ?? "",
    redirectUri: redirectUri ?? "",
    completionUrl: completionUrl ?? "",
    secretExpiresAt: secretExpiresAt?.slice(0, 10) ?? "",
  });
  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      setValues((current) => ({ ...current, clientSecret: "", webhookSecret: "" }));
    }
  }, [state, setValues]);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>Edit</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} provider={provider} />
          <DialogHeader>
            <DialogIcon icon={KeyRoundIcon} />
            <DialogTitle>Your {name} app</DialogTitle>
            <DialogDescription>
              A different client ID needs its hosts to consent again, so that means a new app.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <Field>
              <FieldLabel>New client secret</FieldLabel>
              <Input {...bind("clientSecret")} autoComplete="off" type="password" />
              <FieldDescription>
                It's tried with {name} on a host's connection before it replaces the old one. Leave
                it empty to keep the current one.
              </FieldDescription>
            </Field>
            {provider === "zoom" ? (
              <Field>
                <FieldLabel>New Secret Token</FieldLabel>
                <Input {...bind("webhookSecret")} autoComplete="off" type="password" />
                <FieldDescription>Leave it empty to keep the current one.</FieldDescription>
              </Field>
            ) : null}
            <AddressFields bind={bind} provider={provider} />
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

export function DeleteOauthAppButton(
  props: EnvTarget & { oauthAppId: string; name: string; connections: number },
) {
  const { name, connections, ...target } = props;
  const [state, formAction, pending] = useActionToast(deleteOauthAppAction, {
    success: "OAuth app deleted",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>Delete</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your {name} app?</AlertDialogTitle>
            <AlertDialogDescription>
              {connections > 0
                ? `${connections === 1 ? "1 calendar connection uses" : `${connections} calendar connections use`} it, and only this app can refresh their access, so it can't be deleted until they're disconnected.`
                : "New consents go back to coss.com's app."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep</AlertDialogClose>
            <Button disabled={pending || connections > 0} type="submit" variant="destructive">
              Delete app
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
