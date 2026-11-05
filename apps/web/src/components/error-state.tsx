"use client";

import { Button } from "@coss/ui/components/button";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect } from "react";
import { EmptyState } from "@/components/empty-state";
import { reloadForNewDeployment } from "@/lib/version-skew";

/**
 * Handles an error reaching a boundary: a page older than the running deployment reloads, anything
 * else goes to Sentry (server errors arrive with only a `digest`, which their server-side event,
 * onRequestError, carries too). Returns whether it's the former.
 */
export function useBoundaryError(error: Error & { digest?: string }): boolean {
  const versionSkew = unstable_isUnrecognizedActionError(error);
  useEffect(() => {
    if (versionSkew) {
      reloadForNewDeployment();
      return;
    }
    // The SDK's own chunk (instrumentation-client.ts); a no-op while monitoring is off.
    void import("@/lib/monitoring-browser").then(({ captureException }) => captureException(error));
  }, [error, versionSkew]);
  return versionSkew;
}

export function ErrorState(props: { versionSkew: boolean; retry: () => void }) {
  if (props.versionSkew) {
    return (
      <EmptyState
        action={
          <Button onClick={() => window.location.reload()} variant="outline">
            Reload
          </Button>
        }
        description="coss.com was just updated. Reload the page, then try again."
        icon={RefreshCwIcon}
        title="A new version is available"
      />
    );
  }
  return (
    <EmptyState
      action={
        <Button onClick={() => props.retry()} variant="outline">
          Try again
        </Button>
      }
      description="An unexpected error occurred. Try again, or come back in a few minutes."
      icon={TriangleAlertIcon}
      title="Something went wrong"
    />
  );
}

/** A page's failure inside the shell: the sidebar and header stay, so the rest still works. */
export function PageError(props: { error: Error & { digest?: string }; retry: () => void }) {
  const versionSkew = useBoundaryError(props.error);
  return <ErrorState retry={props.retry} versionSkew={versionSkew} />;
}
