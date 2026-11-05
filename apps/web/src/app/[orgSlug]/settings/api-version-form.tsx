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
import { CalendarIcon } from "lucide-react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { upgradeApiVersionAction } from "./actions";

export type ApiVersionChange = { version: string; title: string; description: string };

/** Moves the organization's pinned API version to `latest`, after showing what changes. */
export function UpgradeApiVersionButton(props: {
  orgSlug: string;
  latest: string;
  changes: ApiVersionChange[];
}) {
  // On success the page re-renders on the new version, without this button.
  const [state, formAction, pending] = useActionToast(upgradeApiVersionAction, {
    success: `Upgraded to API version ${props.latest}`,
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" />}>
        Upgrade to {props.latest}
      </AlertDialogTrigger>
      <AlertDialogPopup>
        {/* `contents` keeps header/footer as direct flex children of the popup (coss ui pattern). */}
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <input name="apiVersion" type="hidden" value={props.latest} />
          <AlertDialogHeader>
            <DialogIcon icon={CalendarIcon} />
            <AlertDialogTitle>Upgrade to API version {props.latest}?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests without a <code>Coss-Version</code> header will get the new behavior right
              away. Test your integration first by sending <code>Coss-Version: {props.latest}</code>
              . You can't go back to an older version.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <div className="min-h-0 overflow-y-auto px-6 pb-6">
            <ul className="flex flex-col gap-3 text-sm">
              {props.changes.map((change) => (
                <li key={`${change.version}:${change.title}`}>
                  <p className="font-medium">
                    {change.title} <span className="text-muted-foreground">({change.version})</span>
                  </p>
                  <p className="whitespace-pre-line text-muted-foreground">{change.description}</p>
                </li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit">
              Upgrade
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
