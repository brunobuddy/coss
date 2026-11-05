"use client";

import "@coss/ui/globals.css";
import { fontMono, fontSans } from "@coss/ui/fonts";
import { ErrorState, useBoundaryError } from "@/components/error-state";

/** Replaces the root layout when it (or anything not under a nested error boundary) throws. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const versionSkew = useBoundaryError(error);

  return (
    // Self-contained: the root layout (and its theme provider) didn't render, so this page stays
    // light and loads the fonts itself.
    <html className={`${fontSans.variable} ${fontMono.variable}`} lang="en">
      <body className="min-h-dvh bg-sidebar font-sans text-foreground antialiased">
        <title>{versionSkew ? "Updating · coss.com" : "Something went wrong · coss.com"}</title>
        <main className="flex min-h-dvh p-2">
          <div className="flex flex-1 overflow-hidden rounded-2xl border bg-background">
            <ErrorState retry={retry} versionSkew={versionSkew} />
          </div>
        </main>
      </body>
    </html>
  );
}
