import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Hero, Page, Tray } from "@/components/marketing/kit";
import { formatLegalDate, legalPages } from "@/lib/legal";
import { breadcrumbSchema, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Legal · coss.com",
  description:
    "The terms, privacy policy, acceptable use policy and data processing addendum for coss.com.",
  path: "/legal",
});

export default function LegalIndexPage() {
  return (
    <Page>
      <JsonLd data={breadcrumbSchema([["Legal", "/legal"]])} />
      <Hero
        headline="Legal"
        lede={<p>coss.com is operated by Cal.com, Inc. These documents govern your use of it.</p>}
      >
        <div className="mx-auto max-w-3xl pb-16 sm:pb-24">
          <Tray flush>
            <ul className="flex flex-col">
              {legalPages().map((page) => (
                <li className="border-b last:border-b-0" key={page.url}>
                  <Link
                    className="group flex items-center gap-4 p-4 transition-colors hover:bg-accent/50 sm:px-5"
                    href={page.url}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-medium">{page.data.title}</span>
                      <span className="text-pretty text-muted-foreground text-sm leading-snug">
                        {page.data.description}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Last updated {formatLegalDate(page.data.lastUpdated)}
                      </span>
                    </span>
                    <ArrowRightIcon
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Tray>
        </div>
      </Hero>
    </Page>
  );
}
