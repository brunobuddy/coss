"use client";

import { Button } from "@coss/ui/components/button";
import { Input } from "@coss/ui/components/input";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { confirmTicketOrganizationAction } from "./actions";

export function ConfirmOrganizationForm(props: { ticketId: string }) {
  const [state, formAction, pending] = useActionToast(confirmTicketOrganizationAction, {
    success: "Organization confirmed",
  });
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input name="ticketId" type="hidden" value={props.ticketId} />
      <div className="flex gap-2">
        <Input
          aria-label="Organization id or slug"
          name="organization"
          placeholder="Another org: id or slug"
          required
          size="sm"
        />
        <Button loading={pending} size="sm" type="submit" variant="outline">
          Link
        </Button>
      </div>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}
