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
import { BoxIcon, KeyRoundIcon, RotateCcwIcon, TagsIcon, WebhookIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useActionState, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { DialogIcon } from "@/components/dialog-icon";
import { EventTypePicker } from "@/components/event-type-picker";
import { ColorInput } from "@/components/fields/color-input";
import { ListInput } from "@/components/fields/list-input";
import { FormError } from "@/components/form-error";
import type { ActionResult } from "@/lib/action-result";
import { useActionToast } from "@/lib/toast";
import { DEFAULT_RECOVER_SINCE_HOURS, RECOVER_SINCE_OPTIONS } from "../developers/webhooks/recover";
import {
  DEFAULT_PREVIOUS_SECRET_OPTION,
  PREVIOUS_SECRET_OPTIONS,
} from "../developers/webhooks/secret-roll";
import {
  createHookApplicationAction,
  createHookEndpointAction,
  createHookEventTypeAction,
  deleteHookApplicationAction,
  deleteHookEndpointAction,
  openHookPortalAction,
  recoverHookEndpointAction,
  retryHookDeliveryAction,
  revealHookEndpointSecretAction,
  rollHookEndpointSecretAction,
  saveHookPortalSettingsAction,
  sendHookTestAction,
  setHookEndpointEnabledAction,
  setHookEventTypeArchivedAction,
} from "./actions";

export type EnvTarget = { orgSlug: string; projectSlug: string; envSlug: string };
type AppTarget = EnvTarget & { applicationId: string };
type EndpointTarget = AppTarget & { endpointId: string };

function Hidden(props: Partial<EndpointTarget>) {
  return (
    <>
      {Object.entries(props).map(([name, value]) =>
        value === undefined ? null : <input key={name} name={name} type="hidden" value={value} />,
      )}
    </>
  );
}

function ShownSecret({ secret }: { secret: string }) {
  return (
    <div className="flex flex-col gap-2">
      <code className="block select-all break-all rounded-lg border bg-muted px-3 py-2 font-mono text-sm">
        {secret}
      </code>
      <div>
        <CopyButton label="Copy secret" value={secret} />
      </div>
    </div>
  );
}

/** A one-button form (enable, archive, retry …) that toasts its outcome. */
function ActionButton(props: {
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  hidden: Record<string, string>;
  children: ReactNode;
  success: string;
  size?: "xs" | "sm";
  variant?: "outline" | "ghost";
}) {
  const [, formAction, pending] = useActionToast(props.action, {
    success: props.success,
    errors: "toast",
  });
  return (
    <form action={formAction}>
      {Object.entries(props.hidden).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <Button
        loading={pending}
        size={props.size ?? "sm"}
        type="submit"
        variant={props.variant ?? "outline"}
      >
        {props.children}
      </Button>
    </form>
  );
}

export function CreateApplicationDialog(props: EnvTarget) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Add application</DialogTrigger>
      <DialogPopup>
        <CreateApplicationForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function CreateApplicationForm(props: EnvTarget) {
  const [state, formAction, pending] = useActionToast(createHookApplicationAction, {
    success: "Application added",
  });
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogIcon icon={BoxIcon} />
          <DialogTitle>Application added</DialogTitle>
          <DialogDescription>
            Add its endpoints, or open its portal and let its user add them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            render={
              <Link
                href={`/${props.orgSlug}/${props.projectSlug}/${props.envSlug}/hooks/${state.data.id}`}
              />
            }
          >
            View application
          </Button>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={formAction} className="contents">
      <Hidden {...props} />
      <DialogHeader>
        <DialogIcon icon={BoxIcon} />
        <DialogTitle>Add an application</DialogTitle>
        <DialogDescription>
          One of your customers (or users): they get their own endpoints and portal.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input autoFocus maxLength={256} name="name" placeholder="Acme Corp" required />
          <FieldDescription>Shown to the application's users in the portal.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>UID</FieldLabel>
          <Input maxLength={256} name="uid" placeholder="Optional, e.g. customer_8812" />
          <FieldDescription>
            Your own id for it, to address it by in the API instead of its id.
          </FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Add application
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Mints a portal session for this member and opens it in a new tab. */
export function OpenPortalButton(props: AppTarget) {
  const [state, formAction, pending] = useActionToast(openHookPortalAction, { errors: "toast" });
  useEffect(() => {
    if (state?.ok) window.open(state.data.url, "_blank", "noopener,noreferrer");
  }, [state]);
  return (
    <form action={formAction}>
      <Hidden {...props} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        Open portal
      </Button>
    </form>
  );
}

export function DeleteApplicationButton(props: AppTarget & { name: string }) {
  const { name, ...target } = props;
  const [state, formAction, pending] = useActionToast(deleteHookApplicationAction, {
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
            <DialogIcon icon={BoxIcon} tone="danger" />
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its endpoints stop receiving messages, including pending retries, and its portal
              sessions end. Its messages can't be viewed any more. This can't be undone.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete application
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function CreateEndpointDialog(props: AppTarget & { eventTypes: readonly string[] }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Add endpoint</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also discards the shown secret. */}
        <CreateEndpointForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function CreateEndpointForm(props: AppTarget & { eventTypes: readonly string[] }) {
  const [state, formAction, pending] = useActionToast(createHookEndpointAction, {
    success: "Endpoint added",
  });
  const { eventTypes, ...target } = props;
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogIcon icon={WebhookIcon} />
          <DialogTitle>Endpoint added</DialogTitle>
          <DialogDescription>
            Its receiver verifies requests with this secret (Standard Webhooks).
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <ShownSecret secret={state.data.secret} />
        </DialogPanel>
        <DialogFooter>
          <Button
            render={
              <Link
                href={`/${props.orgSlug}/${props.projectSlug}/${props.envSlug}/hooks/${props.applicationId}/endpoints/${state.data.id}`}
              />
            }
          >
            View endpoint
          </Button>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={formAction} className="contents">
      <Hidden {...target} />
      <DialogHeader>
        <DialogIcon icon={WebhookIcon} />
        <DialogTitle>Add an endpoint</DialogTitle>
        <DialogDescription>
          coss.com sends this application's messages to the URL, signed with the endpoint's own
          secret.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>URL</FieldLabel>
          <Input
            autoFocus
            name="url"
            placeholder="https://example.com/webhooks"
            required
            type="url"
          />
          <FieldDescription>Must be https:// and publicly reachable.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Description</FieldLabel>
          <Input maxLength={256} name="description" placeholder="Optional" />
        </Field>
        {eventTypes.length > 0 ? (
          <EventTypePicker
            description="Leave all unchecked to receive every type, including ones added later."
            eventTypes={eventTypes}
            legend="Event types"
            name="filterTypes"
          />
        ) : null}
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Add endpoint
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ToggleEndpointButton(props: EndpointTarget & { enabled: boolean }) {
  const { enabled, ...target } = props;
  return (
    <ActionButton
      action={setHookEndpointEnabledAction}
      hidden={{ ...target, enabled: String(!enabled) }}
      success={enabled ? "Endpoint disabled" : "Endpoint enabled"}
    >
      {enabled ? "Disable" : "Enable"}
    </ActionButton>
  );
}

export function DeleteEndpointButton(props: EndpointTarget & { url: string }) {
  const [state, formAction, pending] = useActionToast(deleteHookEndpointAction, {
    success: "Endpoint deleted",
  });
  const { url, ...target } = props;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <AlertDialogHeader>
            <DialogIcon icon={WebhookIcon} tone="danger" />
            <AlertDialogTitle>Delete this endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              {url} stops receiving messages, including pending retries. This can't be undone.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete endpoint
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function RevealSecret(props: EndpointTarget) {
  const [state, formAction, pending] = useActionState(revealHookEndpointSecretAction, null);
  if (state?.ok) return <ShownSecret secret={state.data.secret} />;
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Hidden {...props} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        Reveal signing secret
      </Button>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}

export function RollSecretButton(props: EndpointTarget) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Roll secret</DialogTrigger>
      <DialogPopup>
        <RollSecretForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function RollSecretForm(props: EndpointTarget) {
  const [state, formAction, pending] = useActionToast(rollHookEndpointSecretAction, {
    success: "Signing secret rolled",
  });
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogIcon icon={KeyRoundIcon} />
          <DialogTitle>New signing secret</DialogTitle>
          <DialogDescription>
            Until the previous secret stops signing, every request carries a signature for each.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <ShownSecret secret={state.data.secret} />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={formAction} className="contents">
      <Hidden {...props} />
      <DialogHeader>
        <DialogIcon icon={KeyRoundIcon} />
        <DialogTitle>Roll the signing secret?</DialogTitle>
        <DialogDescription>
          A new secret signs every request from now on. Choose how long the current one keeps
          signing as well.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <RadioGroup
          aria-label="The current secret stops signing"
          defaultValue={String(DEFAULT_PREVIOUS_SECRET_OPTION)}
          name="previousSecretExpiresIn"
        >
          {PREVIOUS_SECRET_OPTIONS.map((option) => (
            <Label className="items-start gap-3" key={option.seconds}>
              <Radio className="mt-0.5" value={String(option.seconds)} />
              <span className="flex flex-col gap-0.5">
                {option.label}
                {option.description ? (
                  <span className="font-normal text-muted-foreground text-xs">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </Label>
          ))}
        </RadioGroup>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Roll secret
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RecoverButton(props: EndpointTarget) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Recover failed</DialogTrigger>
      <DialogPopup>
        <RecoverForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function RecoverForm(props: EndpointTarget & { onDone: () => void }) {
  const { onDone, ...target } = props;
  const [state, formAction, pending] = useActionToast(recoverHookEndpointAction, {
    success: {
      title: "Recovery started",
      description: "Failed deliveries are queued for one more attempt; this page shows progress.",
    },
  });
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={formAction} className="contents">
      <Hidden {...target} />
      <DialogHeader>
        <DialogIcon icon={RotateCcwIcon} />
        <DialogTitle>Recover failed deliveries?</DialogTitle>
        <DialogDescription>
          Deliveries that failed every attempt are sent once more, to the endpoint's current URL and
          secret. Use this after fixing a receiver that was down.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <RadioGroup
          aria-label="Recover deliveries of messages sent in"
          defaultValue={String(DEFAULT_RECOVER_SINCE_HOURS)}
          name="sinceHours"
        >
          {RECOVER_SINCE_OPTIONS.map((option) => (
            <Label className="items-start gap-3" key={option.hours}>
              <Radio className="mt-0.5" value={String(option.hours)} />
              {option.label}
            </Label>
          ))}
        </RadioGroup>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Recover
        </Button>
      </DialogFooter>
    </form>
  );
}

export function SendTestButton(props: EndpointTarget & { eventTypes: readonly string[] }) {
  const [, formAction, pending] = useActionToast(sendHookTestAction, {
    success: "Test message queued",
    errors: "toast",
  });
  const { eventTypes, ...target } = props;
  if (eventTypes.length === 0) return null;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Hidden {...target} />
      <select
        aria-label="Event type"
        className="h-8 rounded-lg border bg-background px-2 font-mono text-xs"
        defaultValue={eventTypes[0]}
        name="eventType"
      >
        {eventTypes.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <Button loading={pending} size="sm" type="submit" variant="outline">
        Send test
      </Button>
    </form>
  );
}

export function RetryDeliveryButton(props: AppTarget & { deliveryId: string }) {
  return (
    <ActionButton
      action={retryHookDeliveryAction}
      hidden={props}
      size="xs"
      success="Delivery queued for retry"
    >
      Retry
    </ActionButton>
  );
}

export function CreateEventTypeDialog(props: EnvTarget) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Add event type</DialogTrigger>
      <DialogPopup>
        <CreateEventTypeForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function CreateEventTypeForm(props: EnvTarget & { onDone: () => void }) {
  const { onDone, ...target } = props;
  const [state, formAction, pending] = useActionToast(createHookEventTypeAction, {
    success: { title: "Event type added", description: "Endpoints can now subscribe to it." },
  });
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={formAction} className="contents">
      <Hidden {...target} />
      <DialogHeader>
        <DialogIcon icon={TagsIcon} />
        <DialogTitle>Add an event type</DialogTitle>
        <DialogDescription>
          A kind of message you send. Your applications' users subscribe to the types they want.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input autoFocus maxLength={64} name="name" placeholder="invoice.paid" required />
          <FieldDescription>Letters, digits and . _ -</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Description</FieldLabel>
          <Input maxLength={256} name="description" placeholder="An invoice was paid in full." />
        </Field>
        <Field>
          <FieldLabel>Example payload</FieldLabel>
          <Textarea
            className="font-mono text-xs"
            name="example"
            placeholder='{ "invoice_id": "in_1042", "amount": 4200 }'
            rows={5}
          />
          <FieldDescription>JSON, shown in the portal and sent by test sends.</FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Add event type
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ArchiveEventTypeButton(props: EnvTarget & { name: string; archived: boolean }) {
  const { archived, ...target } = props;
  return (
    <ActionButton
      action={setHookEventTypeArchivedAction}
      hidden={{ ...target, archived: String(!archived) }}
      size="xs"
      success={archived ? `${props.name} restored` : `${props.name} archived`}
    >
      {archived ? "Restore" : "Archive"}
    </ActionButton>
  );
}

const ORIGIN = /^https?:\/\/[^/?#\s]+$/i;

export function PortalSettingsForm(
  props: EnvTarget & {
    sandbox: boolean;
    settings: {
      allowedOrigins: string[];
      displayName: string | null;
      accentColor: string | null;
      theme: string;
    };
  },
) {
  const [state, formAction, pending] = useActionToast(saveHookPortalSettingsAction, {
    success: "Portal settings saved",
  });
  const { settings, sandbox, ...target } = props;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Hidden {...target} />
      <Field>
        <FieldLabel>Sites allowed to embed the portal</FieldLabel>
        <ListInput
          check={(value) => ORIGIN.test(value)}
          defaultValue={settings.allowedOrigins}
          inputMode="url"
          name="allowedOrigins"
          placeholder="https://app.example.com"
          separator="\n"
        />
        <FieldDescription>
          Origins (https://, no path{sandbox ? "; http://localhost works here" : ""}). Without any,
          the portal only opens as its own page.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Display name</FieldLabel>
        <Input
          defaultValue={settings.displayName ?? ""}
          maxLength={64}
          name="displayName"
          placeholder="Your product's name"
        />
      </Field>
      <Field>
        <FieldLabel>Accent color</FieldLabel>
        <ColorInput defaultValue={settings.accentColor ?? ""} name="accentColor" />
      </Field>
      <Field>
        <FieldLabel>Theme</FieldLabel>
        <RadioGroup aria-label="Theme" defaultValue={settings.theme} name="theme">
          {[
            ["system", "Follow the user's system"],
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
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} type="submit">
          Save settings
        </Button>
      </div>
    </form>
  );
}
