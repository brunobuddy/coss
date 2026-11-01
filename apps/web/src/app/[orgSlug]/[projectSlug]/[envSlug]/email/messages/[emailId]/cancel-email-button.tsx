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
import { cancelEmailAction } from "./actions";

export function CancelEmailButton(props: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  emailId: string;
}) {
  // On success the page re-renders as canceled without this button, which unmounts the dialog.
  const [state, formAction, pending] = useActionToast(cancelEmailAction, {
    success: "Scheduled email canceled",
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive-outline" />}>
        Cancel email
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <input name="projectSlug" type="hidden" value={props.projectSlug} />
          <input name="envSlug" type="hidden" value={props.envSlug} />
          <input name="emailId" type="hidden" value={props.emailId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this scheduled email?</AlertDialogTitle>
            <AlertDialogDescription>
              It will not be sent. To send it at another time, reschedule it instead.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep scheduled</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Cancel email
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
