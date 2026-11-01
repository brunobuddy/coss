"use client";

import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@coss/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Label } from "@coss/ui/components/label";
import { Textarea } from "@coss/ui/components/textarea";
import { useEffect, useState } from "react";
import { AbuseCategoryField } from "@/components/admin/abuse-category-field";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { type ReportAbuseResult, reportAbuseAction } from "./actions";

export type ReportAbuseOrganization = {
  id: string;
  name: string;
  role: string;
  suspended: boolean;
};

type Props = {
  /** The sign-up to report; without one, every sign-up of the user's address is reported. */
  assessmentId?: string;
  email: string | null;
  /** The account the sign-up became; `null` when it was refused or the account is gone. */
  user: { id: string; banned: boolean } | null;
  /** Why the account can't be taken down from here (a platform admin, yourself), if it can't. */
  takeDownBlocked?: string | null;
  organizations: ReportAbuseOrganization[];
  /** Whether sign-ups are assessed at all (`RISK_SIGNUP_ENVIRONMENT_ID`). */
  signUpsAssessed: boolean;
  triggerLabel?: string;
};

const isOwner = (role: string) => role.split(",").includes("owner");

function successToast(data: ReportAbuseResult) {
  if (!data.takenDown) return "Sign-up reported to coss.com Risk";
  const parts = [
    `${data.organizations} organization${data.organizations === 1 ? "" : "s"} taken down`,
    `${data.reported} sign-up${data.reported === 1 ? "" : "s"} reported to coss.com Risk`,
  ];
  return { title: "Account taken down", description: parts.join(", ") };
}

/**
 * The admin console's abuse flow: report a sign-up to coss.com Risk and, when it became an
 * account, take the account down with it (ban, plus a takedown of each organization checked).
 */
export function ReportAbuseDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const canTakeDown = props.user !== null && !props.takeDownBlocked;
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        {props.triggerLabel ?? (canTakeDown ? "Take down & report" : "Report")}
      </DialogTrigger>
      <DialogPopup className="max-w-xl">
        {/* The popup unmounts when closed, which also resets the form state. */}
        <ReportAbuseForm {...props} canTakeDown={canTakeDown} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function ReportAbuseForm(props: Props & { canTakeDown: boolean; onDone: () => void }) {
  const [takeDown, setTakeDown] = useState(props.canTakeDown);
  const [state, formAction, pending] = useActionToast(reportAbuseAction, {
    success: successToast,
  });
  const { onDone } = props;

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const who = props.email ?? "this sign-up";
  return (
    <form action={formAction} className="contents">
      {props.assessmentId ? (
        <input name="assessmentId" type="hidden" value={props.assessmentId} />
      ) : null}
      {props.user ? <input name="userId" type="hidden" value={props.user.id} /> : null}
      <DialogHeader>
        <DialogTitle>{takeDown ? `Take down ${who}?` : `Report ${who}?`}</DialogTitle>
        <DialogDescription>
          {props.signUpsAssessed
            ? "The sign-up is reported to coss.com Risk: its mailbox, device, IP and network count against later sign-ups, and an open review is resolved."
            : "Sign-ups aren't assessed (RISK_SIGNUP_ENVIRONMENT_ID is unset), so nothing is reported to coss.com Risk."}
          {takeDown
            ? " The user is banned permanently and signed out, and each organization checked below is taken down: suspended, every API key revoked, and its other members banned unless they belong to another active organization. Their sign-ups are reported too."
            : null}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <AbuseCategoryField />
        {props.user ? (
          props.canTakeDown ? (
            <Label className="font-normal">
              <Checkbox
                checked={takeDown}
                name="takeDown"
                onCheckedChange={(checked) => setTakeDown(checked === true)}
              />
              {props.user.banned
                ? "Take the account down (already banned)"
                : "Take the account down, not just report it"}
            </Label>
          ) : (
            <p className="text-muted-foreground text-sm">{props.takeDownBlocked}</p>
          )
        ) : (
          <p className="text-muted-foreground text-sm">
            No account to take down: the sign-up was refused, or the account is gone.
          </p>
        )}
        {takeDown ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-medium text-sm">Organizations to take down</legend>
            {props.organizations.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Not a member of any organization: only the user is banned.
              </p>
            ) : (
              props.organizations.map((organization) => (
                <Label className="font-normal" key={organization.id}>
                  <Checkbox
                    defaultChecked={isOwner(organization.role) && !organization.suspended}
                    name={`organization:${organization.id}`}
                  />
                  <span>
                    {organization.name}{" "}
                    <span className="text-muted-foreground">
                      ({organization.role}
                      {organization.suspended ? ", suspended" : ""})
                    </span>
                  </span>
                </Label>
              ))
            )}
            <p className="text-muted-foreground text-xs">
              Organizations they own are checked. Leave an organization unchecked when it belongs to
              someone else: banning the user already removes their access to it.
            </p>
          </fieldset>
        ) : null}
        <Field>
          <FieldLabel>Reason</FieldLabel>
          <Textarea
            maxLength={500}
            name="reason"
            placeholder="e.g. Phishing pages for a bank, see /admin/emails"
            required
            rows={3}
          />
          <FieldDescription>
            Kept in the admin audit log and with the Risk report; never shown to the customer.
          </FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit" variant="destructive">
          {takeDown ? "Take down and report" : "Report"}
        </Button>
      </DialogFooter>
    </form>
  );
}
