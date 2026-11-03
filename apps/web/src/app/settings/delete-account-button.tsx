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
import { UserRoundIcon } from "lucide-react";
import { useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { deleteAccountAction } from "./actions";

type Organization = { name: string; slug: string };

export function DeleteAccountButton(props: {
  email: string;
  deleteOrganizations: Organization[];
  leaveOrganizations: Organization[];
  disabled: boolean;
}) {
  // On success the action signs this browser out and redirects to the sign-in page.
  const [state, formAction, pending] = useActionToast(deleteAccountAction, {
    success: { title: "Your account was deleted" },
  });
  const [confirmation, setConfirmation] = useState("");

  return (
    <AlertDialog onOpenChange={() => setConfirmation("")}>
      <AlertDialogTrigger
        disabled={props.disabled}
        render={<Button size="sm" variant="destructive-outline" />}
      >
        Delete account
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <AlertDialogHeader>
            <DialogIcon icon={UserRoundIcon} tone="danger" />
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              You're signed out everywhere, your personal API keys stop working and your profile,
              passkeys and connected accounts are deleted. This can't be undone.
            </AlertDialogDescription>
            {props.deleteOrganizations.length > 0 ? (
              <OrganizationList
                organizations={props.deleteOrganizations}
                title="Deleted with your account, as you're their only member:"
              />
            ) : null}
            {props.deleteOrganizations.length > 0 ? (
              <p className="text-muted-foreground text-sm">
                Their phone numbers go back to the carrier, and you may not be able to get them
                again. To keep one, contact support before you delete your account.
              </p>
            ) : null}
            {props.leaveOrganizations.length > 0 ? (
              <OrganizationList
                organizations={props.leaveOrganizations}
                title="You leave these organizations; their other members keep them:"
              />
            ) : null}
            <Field>
              <FieldLabel>
                Type <code className="font-mono">{props.email}</code> to confirm
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
              disabled={confirmation.trim().toLowerCase() !== props.email.toLowerCase()}
              loading={pending}
              type="submit"
              variant="destructive"
            >
              Delete account
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

function OrganizationList(props: { title: string; organizations: Organization[] }) {
  return (
    <div className="flex flex-col gap-1.5 text-muted-foreground text-sm">
      <p>{props.title}</p>
      <ul className="flex flex-col gap-1">
        {props.organizations.map((organization) => (
          <li className="text-foreground" key={organization.slug}>
            {organization.name}{" "}
            <span className="font-mono text-muted-foreground text-xs">{organization.slug}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
