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
import { Tooltip, TooltipPopup, TooltipTrigger } from "@coss/ui/components/tooltip";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { publishTemplateAction } from "../actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string; templateId: string };

/** Publishes the saved draft (at the revision the editor shows) as the next version. */
export function PublishButton(props: { target: Target; revision: number; blocked: string | null }) {
  const [state, formAction, pending] = useActionState(publishTemplateAction, null);
  if (props.blocked) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Button disabled size="sm">
            Publish
          </Button>
        </TooltipTrigger>
        <TooltipPopup>{props.blocked}</TooltipPopup>
      </Tooltip>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" />}>Publish</AlertDialogTrigger>
      <AlertDialogPopup>
        {state?.ok ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Published version {state.data.version}</AlertDialogTitle>
              <AlertDialogDescription>
                Sends use it from now on. Emails already accepted keep their content.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button />}>Done</AlertDialogClose>
            </AlertDialogFooter>
          </>
        ) : (
          <form action={formAction} className="contents">
            <input name="orgSlug" type="hidden" value={props.target.orgSlug} />
            <input name="projectSlug" type="hidden" value={props.target.projectSlug} />
            <input name="envSlug" type="hidden" value={props.target.envSlug} />
            <input name="templateId" type="hidden" value={props.target.templateId} />
            <input name="revision" type="hidden" value={props.revision} />
            <AlertDialogHeader>
              <AlertDialogTitle>Publish the draft?</AlertDialogTitle>
              <AlertDialogDescription>
                It becomes the template's next version, which every send without a
                `template_version` uses from now on. Older versions stay available to restore.
              </AlertDialogDescription>
              {state && !state.ok ? <FormError message={state.error} /> : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
              <Button loading={pending} type="submit">
                Publish
              </Button>
            </AlertDialogFooter>
          </form>
        )}
      </AlertDialogPopup>
    </AlertDialog>
  );
}
