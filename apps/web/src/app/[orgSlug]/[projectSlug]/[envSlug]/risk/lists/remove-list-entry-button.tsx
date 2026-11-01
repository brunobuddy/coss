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
import { removeRiskListEntryAction } from "../actions";

export function RemoveRiskListEntryButton(props: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  entryId: string;
  value: string;
  list: "allow" | "block";
}) {
  // On success the page re-renders without this entry, which unmounts the dialog.
  const [state, formAction, pending] = useActionToast(removeRiskListEntryAction, {
    success: `Removed ${props.value} from the ${props.list} list`,
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
          <input name="entryId" type="hidden" value={props.entryId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {props.value}?</AlertDialogTitle>
            <AlertDialogDescription>
              Later assessments are no longer {props.list === "block" ? "blocked" : "allowed"} by
              this entry.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Remove entry
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
