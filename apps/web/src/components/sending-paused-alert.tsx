import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { SupportLink } from "@/components/support/support-link";

/** Shown while the organization's provider tenant is paused (reputation enforcement). */
export function SendingPausedAlert({ cause, orgSlug }: { cause: string | null; orgSlug: string }) {
  return (
    <Alert variant="error">
      <AlertTitle>Sending is paused</AlertTitle>
      <AlertDescription>
        Live emails from this organization are refused because of its sending reputation (high
        bounce or complaint rates).{cause ? ` ${cause}` : ""}{" "}
        <SupportLink orgSlug={orgSlug} subject="Sending is paused" topic="deliverability" /> to
        resume sending.
      </AlertDescription>
    </Alert>
  );
}
