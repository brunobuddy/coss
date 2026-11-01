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
import { cancelInvitationAction } from "./actions";

export function CancelInvitationButton(props: {
  orgSlug: string;
  invitationId: string;
  email: string;
}) {
  // On success the page re-renders without this invitation, which unmounts the dialog.
  const [state, formAction, pending] = useActionToast(cancelInvitationAction, {
    success: `Invitation for ${props.email} canceled`,
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="destructive-outline" />}>
        Cancel
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <input name="invitationId" type="hidden" value={props.invitationId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel the invitation for {props.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              The invitation link will stop working. You can invite them again later.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep invitation</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Cancel invitation
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
