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
import { Field, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { BuildingIcon } from "lucide-react";
import { useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { deleteOrganizationAction } from "./actions";

export function DeleteOrganizationButton(props: { orgSlug: string; orgName: string }) {
  // On success the action redirects away from this organization.
  const [state, formAction, pending] = useActionToast(deleteOrganizationAction, {
    success: {
      title: `${props.orgName} is being deleted`,
      description: "Its members have lost access; its data is deleted shortly.",
    },
  });
  const [confirmation, setConfirmation] = useState("");

  return (
    <AlertDialog onOpenChange={() => setConfirmation("")}>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete organization
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <AlertDialogHeader>
            <DialogIcon icon={BuildingIcon} tone="danger" />
            <AlertDialogTitle>Delete {props.orgName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every member loses access, every API key stops working and scheduled emails are
              canceled right away. Its projects, emails, domains, suppression lists and webhooks are
              then deleted for good. This can't be undone.
            </AlertDialogDescription>
            <Field>
              <FieldLabel>
                Type <code className="font-mono">{props.orgSlug}</code> to confirm
              </FieldLabel>
              <Input
                autoComplete="off"
                name="confirm"
                onChange={(event) => setConfirmation(event.target.value)}
                spellCheck={false}
                value={confirmation}
              />
            </Field>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button
              disabled={confirmation.trim() !== props.orgSlug}
              loading={pending}
              type="submit"
              variant="destructive"
            >
              Delete organization
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
