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
import { deleteRiskRuleAction, toggleRiskRuleAction } from "../actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string; ruleId: string };

function Hidden(props: Target) {
  return (
    <>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="ruleId" type="hidden" value={props.ruleId} />
    </>
  );
}

export function ToggleRuleButton(props: Target & { enabled: boolean }) {
  const [, formAction, pending] = useActionToast(toggleRiskRuleAction, {
    success: props.enabled ? "Rule disabled" : "Rule enabled",
    errors: "toast",
  });
  return (
    <form action={formAction}>
      <Hidden {...props} />
      <input name="enabled" type="hidden" value={String(!props.enabled)} />
      <Button loading={pending} size="xs" type="submit" variant="outline">
        {props.enabled ? "Disable" : "Enable"}
      </Button>
    </form>
  );
}

export function DeleteRuleButton(props: Target & { name: string }) {
  // On success the page re-renders without this rule, which unmounts the dialog.
  const [state, formAction, pending] = useActionToast(deleteRiskRuleAction, {
    success: "Rule deleted",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{props.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Later assessments are no longer decided by this rule.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete rule
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
