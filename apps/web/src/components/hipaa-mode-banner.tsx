import { ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

/** A quiet reminder on every page of an organization in HIPAA mode. */
export function HipaaModeBanner(props: { orgSlug: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-muted-foreground text-sm">
      <ShieldCheckIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="font-medium text-foreground">HIPAA mode</span>
      <Link
        className="ms-auto underline-offset-4 hover:underline"
        href={`/${props.orgSlug}/settings/compliance`}
      >
        See what it does
      </Link>
    </div>
  );
}
