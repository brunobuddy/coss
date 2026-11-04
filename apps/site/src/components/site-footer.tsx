import { cn } from "@coss/ui/lib/utils";
import Link from "next/link";
import { FOOTER_COLUMNS } from "@/lib/nav";

export const LEGAL_LINKS = [
  { text: "Terms", url: "/legal/terms" },
  { text: "Privacy", url: "/legal/privacy" },
  { text: "Acceptable Use", url: "/legal/acceptable-use" },
  { text: "DPA", url: "/legal/dpa" },
] as const;

/** Legal links, linked from every page of the site. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={className}>
      {LEGAL_LINKS.map((link) => (
        <Link className="hover:text-foreground" href={link.url} key={link.url}>
          {link.text}
        </Link>
      ))}
    </nav>
  );
}

/** The wordmark and company line of coss.com/ui's docs footer. */
function Colophon({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <p>
        <Link
          className="font-bold font-heading text-foreground text-lg [font-variation-settings:'GEOM'_50,'opsz'_32]"
          href="/"
        >
          coss.com
        </Link>
      </p>
      <p className="text-muted-foreground text-sm">© {new Date().getFullYear()} Cal.com, Inc.</p>
    </div>
  );
}

/** Other apps on coss.com: a full page load, so no `next/link`. */
const OTHER_ZONES = new Set(["/ui", "/origin", "/qnot"]);

/**
 * The site's link columns. The header's mega menu renders only in the browser, so these are what
 * crawlers follow from any page to the products, comparisons and the rest.
 */
function FooterColumns({ className }: { className?: string }) {
  return (
    <nav aria-label="Site" className={className}>
      {FOOTER_COLUMNS.map((column) => (
        <div className="flex flex-col gap-3" key={column.title}>
          <p className="font-medium text-foreground text-sm">{column.title}</p>
          <ul className="flex flex-col gap-2 text-sm">
            {column.links.map(([label, href]) => (
              <li key={href}>
                {href.endsWith(".txt") || href.startsWith("http") || OTHER_ZONES.has(href) ? (
                  <a className="hover:text-foreground" href={href}>
                    {label}
                  </a>
                ) : (
                  <Link className="hover:text-foreground" href={href}>
                    {label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Footer of the landing page, the product, solution, comparison, pricing and legal pages (full
 * width, below the rails): the site's link columns, then the colophon.
 */
export function SiteFooter() {
  return (
    <footer className="relative border-border/64 border-t bg-muted/32 py-12 text-muted-foreground sm:py-16">
      <FooterColumns className="mx-auto grid w-full max-w-[1416px] grid-cols-2 gap-x-6 gap-y-10 px-4 pb-12 sm:grid-cols-3 sm:px-6 lg:grid-cols-6" />
      <div className="mx-auto flex w-full max-w-[1416px] flex-col gap-4 border-border/64 border-t px-4 pt-8 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <Colophon />
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link className="hover:text-foreground" href="/about">
            About
          </Link>
          <LegalLinks className="contents" />
        </div>
      </div>
    </footer>
  );
}

/** Footer of a docs page: inside its card, like coss.com/ui. */
export function DocsFooter() {
  return (
    <footer className="flex flex-col gap-8">
      <FooterColumns className="grid grid-cols-2 gap-x-6 gap-y-8 text-muted-foreground sm:grid-cols-3" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Colophon />
        <LegalLinks className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm" />
      </div>
    </footer>
  );
}
