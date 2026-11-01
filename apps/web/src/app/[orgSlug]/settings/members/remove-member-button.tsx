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
import { removeMemberAction } from "./actions";

export function RemoveMemberButton(props: {
  orgSlug: string;
  orgName: string;
  memberId: string;
  memberName: string;
}) {
  // On success the page re-renders without this member, which unmounts the dialog.
  const [state, formAction, pending] = useActionToast(removeMemberAction, {
    success: `${props.memberName} removed`,
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
          <input name="memberId" type="hidden" value={props.memberId} />
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {props.memberName} from {props.orgName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They lose access right away and invitations they sent are canceled. API keys they
              created keep working; revoke them separately if needed. You can invite them again
              later.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep member</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Remove member
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
