import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { SupportLink } from "@/components/support/support-link";

/** Shown to members while a platform admin has the organization suspended. */
export function SuspendedAlert(props: { orgSlug: string }) {
  return (
    <Alert variant="error">
      <AlertTitle>This organization is suspended</AlertTitle>
      <AlertDescription>
        Its API keys are refused, webhook deliveries are on hold and changes are disabled. You can
        still view its data.{" "}
        <SupportLink orgSlug={props.orgSlug} subject="Suspended organization" topic="account" /> to
        resolve the suspension.
      </AlertDescription>
    </Alert>
  );
}
