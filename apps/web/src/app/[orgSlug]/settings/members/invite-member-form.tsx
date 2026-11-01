"use client";

import { Button } from "@coss/ui/components/button";
import { Field, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { inviteMemberAction } from "./actions";

const ROLE_ITEMS = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
];

export function InviteMemberForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction, pending] = useActionToast(inviteMemberAction, {
    success: (data) => ({
      title: `Invitation sent to ${data.email}`,
      // Outside production the dashboard logs account email links instead of sending them.
      description: "They'll get an email with a link to join.",
    }),
  });

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <div className="flex flex-wrap items-end gap-3">
        <Field className="min-w-64 flex-1">
          <FieldLabel>Email</FieldLabel>
          <Input name="email" placeholder="teammate@example.com" required type="email" />
        </Field>
        <Field>
          <FieldLabel>Role</FieldLabel>
          <Select defaultValue="member" items={ROLE_ITEMS} name="role">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {ROLE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        <Button loading={pending} type="submit">
          Send invitation
        </Button>
      </div>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}
