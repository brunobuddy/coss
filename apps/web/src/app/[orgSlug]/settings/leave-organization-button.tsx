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
import { BuildingIcon } from "lucide-react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { leaveOrganizationAction } from "./actions";

export function LeaveOrganizationButton(props: { orgSlug: string; orgName: string }) {
  // On success the action redirects away from this organization.
  const [state, formAction, pending] = useActionToast(leaveOrganizationAction, {
    success: `You left ${props.orgName}`,
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Leave organization
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <AlertDialogHeader>
            <DialogIcon icon={BuildingIcon} tone="danger" />
            <AlertDialogTitle>Leave {props.orgName}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access to its projects, domains and emails right away, and invitations
              you sent are canceled. API keys you created keep working. To come back, someone will
              have to invite you again.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Stay</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Leave organization
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
