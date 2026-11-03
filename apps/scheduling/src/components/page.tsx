import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Skeleton } from "@coss/ui/components/skeleton";
import { cn } from "@coss/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Branding } from "@/lib/branding";

const LOGO_MAX_WIDTH = 180;
const LOGO_MAX_HEIGHT = 40;

/** The customer's logo, else their name; nothing of coss.com's on a page that's theirs. */
export function BrandMark({ branding }: { branding: Branding }) {
  const { logo, brand_name: name } = branding;
  if (logo) {
    const scale = Math.min(1, LOGO_MAX_WIDTH / logo.width, LOGO_MAX_HEIGHT / logo.height);
    return (
      // A data URL from the API: there's nothing for next/image to fetch or resize.
      // biome-ignore lint/performance/noImgElement: see above.
      <img
        alt={name ?? ""}
        className="block"
        height={Math.round(logo.height * scale)}
        src={logo.data_url}
        width={Math.round(logo.width * scale)}
      />
    );
  }
  return name ? <p className="font-medium text-muted-foreground text-sm">{name}</p> : null;
}

export function TestModeNotice() {
  return (
    <p className="rounded-lg bg-warning/8 px-3 py-2 text-center text-warning-foreground text-xs">
      Test mode: nothing here is real, and nobody's emailed.
    </p>
  );
}

/** The page's one surface. Everything sits in it, so an embed looks the same as a hosted page. */
export function Panel(props: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border bg-card shadow-xs/5", props.className)}>
      {props.children}
    </div>
  );
}

export function PageTitle(props: { className?: string; children: ReactNode }) {
  return (
    <h1
      className={cn(
        "text-balance font-heading font-semibold text-2xl tracking-[-0.02em]",
        props.className,
      )}
    >
      {props.children}
    </h1>
  );
}

export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col gap-2.5 text-sm">{children}</dl>;
}

export function Detail(props: { icon: LucideIcon; label: string; children: ReactNode }) {
  const Icon = props.icon;
  return (
    <div className="flex min-w-0 items-start gap-2.5 has-[input]:items-center">
      <dt className="flex h-5 shrink-0 items-center text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
        <span className="sr-only">{props.label}</span>
      </dt>
      <dd className="min-w-0 flex-1 wrap-break-word">{props.children}</dd>
    </div>
  );
}

export function BrokenLink(props: { title: string; message: string }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-6 sm:py-12">
      <Alert variant="error">
        <AlertTitle>{props.title}</AlertTitle>
        <AlertDescription>{props.message}</AlertDescription>
      </Alert>
    </main>
  );
}

export function LoadingPanel({ className }: { className?: string }) {
  return (
    <main aria-busy="true" className={cn("mx-auto w-full px-4 py-6 sm:py-12", className)}>
      <span className="sr-only">Loading</span>
      <Panel className="flex flex-col gap-4 p-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </Panel>
    </main>
  );
}
