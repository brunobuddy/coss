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
import { revokeApiKeyAction } from "./actions";

export function RevokeApiKeyButton(props: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  keyId: string;
  keyName: string;
}) {
  // On success the page re-renders without this key, which unmounts the dialog.
  const [state, formAction, pending] = useActionToast(revokeApiKeyAction, {
    success: `API key “${props.keyName}” revoked`,
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="destructive-outline" />}>
        Revoke
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <input name="projectSlug" type="hidden" value={props.projectSlug} />
          <input name="envSlug" type="hidden" value={props.envSlug} />
          <input name="keyId" type="hidden" value={props.keyId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{props.keyName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests using this key will be rejected immediately. This can't be undone.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Revoke key
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
