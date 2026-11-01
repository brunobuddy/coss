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
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { removeSuppressionAction } from "./actions";

export function RemoveSuppressionButton(props: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  suppressionId: string;
  address: string;
  scope: string;
}) {
  // On success the page re-renders without this entry, which unmounts the dialog.
  const [state, formAction, pending] = useActionToast(removeSuppressionAction, {
    success: `${props.address} is no longer suppressed`,
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="destructive-outline" />}>
        Remove
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <input name="projectSlug" type="hidden" value={props.projectSlug} />
          <input name="envSlug" type="hidden" value={props.envSlug} />
          <input name="suppressionId" type="hidden" value={props.suppressionId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {props.address}?</AlertDialogTitle>
            <AlertDialogDescription>
              {props.scope === "*" ? "Emails" : `Emails in the “${props.scope}” category`} from this
              environment will be sent to this address again. Sending to an address that bounced or
              complained can hurt your sending reputation.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Remove suppression
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
