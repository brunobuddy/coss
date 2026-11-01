"use client";

import { Button } from "@coss/ui/components/button";
import { useActionToast } from "@/lib/toast";
import { resendInvitationAction } from "./actions";

/** Re-sends the invitation and extends its expiry. */
export function ResendInvitationButton(props: {
  orgSlug: string;
  invitationId: string;
  email: string;
}) {
  const [, formAction, pending] = useActionToast(resendInvitationAction, {
    success: `Invitation resent to ${props.email}`,
    errors: "toast",
  });

  return (
    <form action={formAction}>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="invitationId" type="hidden" value={props.invitationId} />
      <Button loading={pending} size="xs" type="submit" variant="outline">
        Resend
      </Button>
    </form>
  );
}
