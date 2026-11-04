"use client";

import { Button } from "@coss/ui/components/button";

/** The details stay on the server: its Sentry event carries them, and this page shows none. */
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-2 p-6">
      <h1 className="font-semibold text-xl">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">
        Try again, or come back in a few minutes. Nothing you did caused this.
      </p>
      <div className="mt-2">
        <Button onClick={() => retry()} variant="outline">
          Try again
        </Button>
      </div>
    </main>
  );
}
