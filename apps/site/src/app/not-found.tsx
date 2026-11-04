import { Button } from "@coss/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "Page not found" };

// No SiteShell: this page is prerendered once for every missing path, and the header's links read
// the path, so it wouldn't hydrate.
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start gap-6 px-4 py-24">
        <h1 className="font-semibold text-4xl tracking-tight">Page not found</h1>
        <p className="text-lg text-muted-foreground">
          This page doesn't exist, or it has moved. These may help.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Button render={<Link href="/" />}>Home</Button>
          <Button render={<Link href="/products" />} variant="outline">
            Products
          </Button>
          <Button render={<Link href="/docs" />} variant="outline">
            Docs
          </Button>
          <Button render={<Link href="/pricing" />} variant="outline">
            Pricing
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
