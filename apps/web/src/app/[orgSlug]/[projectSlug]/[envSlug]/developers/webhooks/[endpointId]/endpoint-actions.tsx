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
import { Label } from "@coss/ui/components/label";
import { Radio, RadioGroup } from "@coss/ui/components/radio-group";
import { useActionState, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  deleteWebhookEndpointAction,
  recoverWebhookEndpointAction,
  retryWebhookDeliveryAction,
  revealWebhookSecretAction,
  rollWebhookSecretAction,
  setWebhookEndpointEnabledAction,
  upgradeWebhookEndpointVersionAction,
} from "../actions";
import { DEFAULT_RECOVER_SINCE_HOURS, RECOVER_SINCE_OPTIONS } from "../recover";
import { DEFAULT_PREVIOUS_SECRET_OPTION, PREVIOUS_SECRET_OPTIONS } from "../secret-roll";

type Target = { orgSlug: string; projectSlug: string; envSlug: string; endpointId: string };

function TargetInputs(props: Target) {
  return (
    <>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="endpointId" type="hidden" value={props.endpointId} />
    </>
  );
}

export function ToggleEndpointButton(props: Target & { enabled: boolean }) {
  const [, formAction, pending] = useActionToast(setWebhookEndpointEnabledAction, {
    success: props.enabled ? "Endpoint disabled" : "Endpoint enabled",
    errors: "toast",
  });
  return (
    <form action={formAction}>
      <TargetInputs {...props} />
      <input name="enabled" type="hidden" value={String(!props.enabled)} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        {props.enabled ? "Disable" : "Enable"}
      </Button>
    </form>
  );
}

export function UpgradeEndpointVersionButton(props: Target & { latest: string }) {
  const [state, formAction, pending] = useActionToast(upgradeWebhookEndpointVersionAction, {
    success: `Endpoint upgraded to ${props.latest}`,
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
        Upgrade to {props.latest}
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <input name="apiVersion" type="hidden" value={props.latest} />
          <AlertDialogHeader>
            <AlertDialogTitle>Send events in API version {props.latest}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every event from now on, including pending retries, is rendered in the new version.
              Make sure your receiver handles it first: the API changelog lists what changed.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit">
              Upgrade
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function DeleteEndpointButton(props: Target & { url: string }) {
  // On success the action redirects to the endpoint list.
  const [state, formAction, pending] = useActionToast(deleteWebhookEndpointAction, {
    success: "Webhook endpoint deleted",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              {props.url} will stop receiving events, including pending retries. This can't be
              undone.
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

export function RevealSecret(props: Target) {
  const [state, formAction, pending] = useActionState(revealWebhookSecretAction, null);
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-2">
        <code className="block select-all break-all rounded-lg border bg-muted px-3 py-2 font-mono text-sm">
          {state.data.secret}
        </code>
        <div>
          <CopyButton label="Copy secret" value={state.data.secret} />
        </div>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <TargetInputs {...props} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        Reveal signing secret
      </Button>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}

export function RollSecretButton(props: Target) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Roll secret</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also discards the shown secret. */}
        <RollSecretForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function RollSecretForm(props: Target) {
  const [state, formAction, pending] = useActionToast(rollWebhookSecretAction, {
    success: "Signing secret rolled",
  });
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>New signing secret</DialogTitle>
          <DialogDescription>
            Deploy it to your receiver. Until the previous secret stops signing, every request
            carries a signature for each, so either one verifies it.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-2">
          <code className="block select-all break-all rounded-lg border bg-muted px-3 py-2 font-mono text-sm">
            {state.data.secret}
          </code>
          <div>
            <CopyButton label="Copy secret" value={state.data.secret} />
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogTitle>Roll the signing secret?</DialogTitle>
        <DialogDescription>
          A new secret signs every request from now on. Choose how long the current one keeps
          signing as well, so your receiver accepts requests while you switch it over.
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

export function RetryDeliveryButton(props: Target & { deliveryId: string }) {
  const [, formAction, pending] = useActionToast(retryWebhookDeliveryAction, {
    success: "Delivery queued for retry",
    errors: "toast",
  });
  return (
    <form action={formAction}>
      <TargetInputs {...props} />
      <input name="deliveryId" type="hidden" value={props.deliveryId} />
      <Button loading={pending} size="xs" type="submit" variant="outline">
        Retry
      </Button>
    </form>
  );
}

export function RecoverDeliveriesButton(props: Target) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Recover failed</DialogTrigger>
      <DialogPopup>
        <RecoverDeliveriesForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function RecoverDeliveriesForm(props: Target & { onDone: () => void }) {
  const [state, formAction, pending] = useActionToast(recoverWebhookEndpointAction, {
    success: ({ requeued, hasMore }) => {
      if (requeued === 0) {
        return {
          type: "info",
          title: "No failed deliveries",
          description: "Nothing failed in that period.",
        };
      }
      return {
        title: `${requeued} ${requeued === 1 ? "delivery" : "deliveries"} queued`,
        description: hasMore
          ? "More failed in that period: recover again to queue the rest."
          : "Each gets one more attempt within the next minute.",
      };
    },
  });
  const { onDone } = props;

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogTitle>Recover failed deliveries?</DialogTitle>
        <DialogDescription>
          Deliveries that failed every attempt are sent once more, to the endpoint's current URL and
          signed with its current secret. Use this after fixing a receiver that was down.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <RadioGroup
          aria-label="Recover deliveries that failed in"
          defaultValue={String(DEFAULT_RECOVER_SINCE_HOURS)}
          name="sinceHours"
        >
          {RECOVER_SINCE_OPTIONS.map((option) => (
            <Label className="items-start gap-3" key={option.hours}>
              <Radio className="mt-0.5" value={String(option.hours)} />
              <span className="flex flex-col gap-0.5">
                {option.label}
                {"description" in option ? (
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
          Recover
        </Button>
      </DialogFooter>
    </form>
  );
}
