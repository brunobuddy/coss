import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import Link from "next/link";
import { SupportLink } from "@/components/support/support-link";
import type { BillingBannerState } from "@/lib/billing";

/** Org-wide banner (layout) for billing readers: holds, overdue invoices, a used-up allowance. */
export function BillingBanner(props: { state: BillingBannerState; href: string; orgSlug: string }) {
  const { held, pastDue, allowance } = props.state;
  const link = (
    <Link className="underline" href={props.href}>
      Open billing
    </Link>
  );
  if (held) {
    return (
      <Alert variant="error">
        <AlertTitle>Live sending is paused</AlertTitle>
        <AlertDescription>
          {held === "delinquent"
            ? "An invoice is overdue. Sending resumes as soon as it is paid."
            : held === "spend_limit"
              ? "This month's usage reached your spend limit. Raise it, or sending resumes next month."
              : "coss.com paused live sending for billing reasons."}{" "}
          {held !== "delinquent" && held !== "spend_limit" ? (
            <>
              <SupportLink orgSlug={props.orgSlug} subject="Billing hold" topic="billing" />.{" "}
            </>
          ) : null}
          Sandbox keys still work. {link}
        </AlertDescription>
      </Alert>
    );
  }
  if (pastDue) {
    return (
      <Alert variant="warning">
        <AlertDescription>An invoice is past due. Pay it to keep sending. {link}</AlertDescription>
      </Alert>
    );
  }
  if (allowance) {
    const full = allowance.used >= allowance.cap;
    return (
      <Alert variant={full ? "error" : "warning"}>
        <AlertDescription>
          {full
            ? `You've used all ${allowance.cap.toLocaleString("en-US")} ${allowance.label} included this month: live sends are refused until next month.`
            : `You've used ${allowance.used.toLocaleString("en-US")} of the ${allowance.cap.toLocaleString("en-US")} ${allowance.label} included this month.`}{" "}
          <Link className="underline" href={`${props.href}/plans`}>
            Upgrade
          </Link>
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
