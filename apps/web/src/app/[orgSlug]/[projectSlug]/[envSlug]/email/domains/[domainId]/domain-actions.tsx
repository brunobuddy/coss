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
import { Switch } from "@coss/ui/components/switch";
import { useRef } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  deleteDomainAction,
  shareDomainWithSubaccountsAction,
  type VerifyOutcome,
  verifyDomainAction,
} from "../actions";

type Target = { orgSlug: string; domainId: string };

export function VerifyDomainButton(props: Target & { restart: boolean }) {
  const [, formAction, pending] = useActionToast(verifyDomainAction, {
    success: domainCheckToast,
    errors: "toast",
  });

  return (
    <form action={formAction}>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="domainId" type="hidden" value={props.domainId} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        {props.restart ? "Restart verification" : "Verify now"}
      </Button>
    </form>
  );
}

/** A check that finds nothing new is still worth saying: the page itself may not change. */
export function domainCheckToast({ status, restarted }: VerifyOutcome) {
  if (restarted) return "Verification restarted";
  if (status === "verified") return "Domain verified";
  // Failed domains aren't checked again until verification is restarted.
  if (status === "failed") {
    return {
      type: "warning",
      title: "Domain verification failed",
      description: "Check its DNS records, then restart verification.",
    } as const;
  }
  return {
    type: status === "temporary_failure" ? "warning" : "info",
    title:
      status === "temporary_failure"
        ? "Some DNS records stopped resolving"
        : "DNS records not found yet",
    description: "We keep checking automatically; DNS changes can take a while to spread.",
  } as const;
}

export function DeleteDomainButton(props: Target & { name: string }) {
  // On success the action redirects to the domain list.
  const [state, formAction, pending] = useActionToast(deleteDomainAction, {
    success: `${props.name} deleted`,
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <input name="domainId" type="hidden" value={props.domainId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {props.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Live API keys will no longer be able to send from this domain. Emails already sent are
              not affected. Adding it again means publishing new DKIM records.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete domain
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

/** Shares the domain with the organization's sub-accounts (saves on change). */
export function ShareWithSubaccountsSwitch(props: {
  orgSlug: string;
  domainId: string;
  shared: boolean;
  disabled: boolean;
}) {
  const [, formAction, pending] = useActionToast(shareDomainWithSubaccountsAction, {
    success: props.shared ? "No longer shared with sub-accounts" : "Shared with sub-accounts",
    errors: "toast",
  });
  const form = useRef<HTMLFormElement>(null);
  return (
    <form action={formAction} className="flex items-center gap-2" ref={form}>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="domainId" type="hidden" value={props.domainId} />
      <input name="shared" type="hidden" value={String(!props.shared)} />
      <Switch
        aria-label="Share with sub-accounts"
        checked={pending ? !props.shared : props.shared}
        disabled={props.disabled || pending}
        onCheckedChange={() => form.current?.requestSubmit()}
      />
    </form>
  );
}
