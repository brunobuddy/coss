"use client";

import type { OrgRole } from "@coss/auth/permissions";
import { Button } from "@coss/ui/components/button";
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
import { Label } from "@coss/ui/components/label";
import { Radio, RadioGroup } from "@coss/ui/components/radio-group";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { updateMemberRoleAction } from "./actions";
import { ROLE_DETAILS } from "./roles";

type Props = {
  orgSlug: string;
  memberId: string;
  memberName: string;
  currentRole: string;
  /** Roles the viewer may assign to this member (from `assignableOrgRoles`). */
  roles: OrgRole[];
  isSelf: boolean;
};

export function ChangeRoleDialog(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="xs" variant="outline" />}>Change role</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form state. */}
        <ChangeRoleForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function ChangeRoleForm(props: Props & { onDone: () => void }) {
  // Controlled: a successful save refreshes the page (new `currentRole`) before the dialog closes.
  const [role, setRole] = useState(props.currentRole);
  const [state, formAction, pending] = useActionToast(updateMemberRoleAction, {
    success:
      role === props.currentRole
        ? undefined
        : `${props.memberName}'s role changed to ${ROLE_DETAILS[role as OrgRole]?.label ?? role}`,
  });
  const { onDone } = props;

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="memberId" type="hidden" value={props.memberId} />
      <DialogHeader>
        <DialogTitle>Change role</DialogTitle>
        <DialogDescription>
          {props.isSelf
            ? "Changing your own role can remove your access to this page."
            : `Choose what ${props.memberName} can do in this organization.`}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <RadioGroup
          aria-label="Role"
          name="role"
          onValueChange={(value) => setRole(String(value))}
          value={role}
        >
          {props.roles.map((option) => (
            <Label className="items-start gap-3" key={option}>
              <Radio className="mt-0.5" value={option} />
              <span className="flex flex-col gap-0.5">
                {ROLE_DETAILS[option].label}
                <span className="font-normal text-muted-foreground text-xs">
                  {ROLE_DETAILS[option].description}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Save role
        </Button>
      </DialogFooter>
    </form>
  );
}
