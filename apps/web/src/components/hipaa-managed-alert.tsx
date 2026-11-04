import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import Link from "next/link";
import type { ReactNode } from "react";

/** Above a setting that HIPAA mode decides for the organization. */
export function HipaaManagedAlert(props: { orgSlug: string; children: ReactNode }) {
  return (
    <Alert variant="info">
      <AlertTitle>Managed by HIPAA mode</AlertTitle>
      <AlertDescription>
        <span>
          {props.children}{" "}
          <Link
            className="text-foreground underline underline-offset-4"
            href={`/${props.orgSlug}/settings/compliance`}
          >
            See what HIPAA mode does
          </Link>
        </span>
      </AlertDescription>
    </Alert>
  );
}
