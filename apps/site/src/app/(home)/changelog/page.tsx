import { Button } from "@coss/ui/components/button";
import { ArrowRightIcon, RssIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Container, Hero, Page, ProductTile } from "@/components/marketing/kit";
import { CHANGELOG, CHANGELOG_ROUTE, type ChangelogEntry } from "@/lib/changelog";
import { PRODUCT_VISUALS } from "@/lib/product-visuals";
import { breadcrumbSchema, pageMetadata } from "@/lib/seo";

const base = pageMetadata({
  title: "Changelog: what shipped on coss.com",
  description:
    "New coss.com products and features, newest first: email, SMS, inboxes, scheduling, forms, one-time codes, webhooks and risk checks.",
  path: CHANGELOG_ROUTE,
  markdown: `${CHANGELOG_ROUTE}/index.md`,
});

export const metadata: Metadata = {
  ...base,
  alternates: {
    ...base.alternates,
    types: {
      ...base.alternates?.types,
      "application/rss+xml": `${CHANGELOG_ROUTE}/rss.xml`,
    },
  },
};

/** The entries by month, newest first, in the order they're written. */
function byMonth(entries: readonly ChangelogEntry[]): [string, ChangelogEntry[]][] {
  const months = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), entry]);
  }
  return [...months];
}

function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The product an entry links to, when it links to one: its tile. */
function productSlug(href: string): string | undefined {
  const slug = /^\/products\/([^/#]+)$/.exec(href)?.[1];
  return slug && slug in PRODUCT_VISUALS ? slug : undefined;
}

export default function ChangelogPage() {
  return (
    <Page>
      <JsonLd data={breadcrumbSchema([["Changelog", CHANGELOG_ROUTE]])} />
      <Hero
        actions={
          <>
            <Button
              className="px-5"
              render={<a href={`${CHANGELOG_ROUTE}/rss.xml`} />}
              size="lg"
              variant="outline"
            >
              <RssIcon />
              RSS feed
            </Button>
            <Button
              className="px-5"
              render={<Link href="/docs/api-reference/changelog" />}
              size="lg"
              variant="outline"
            >
              API changelog
            </Button>
          </>
        }
        headline="Changelog"
        lede={
          <p>
            What shipped, newest first. An API version's breaking changes are in the API changelog.
          </p>
        }
      />
      <Container className="flex max-w-5xl flex-col gap-14 py-16 sm:gap-20 sm:py-24">
        {byMonth(CHANGELOG).map(([month, entries]) => (
          <section
            aria-labelledby={`month-${month}`}
            className="grid gap-5 lg:grid-cols-12 lg:gap-10"
            key={month}
          >
            <h2
              className="font-heading font-semibold text-xl tracking-[-0.01em] lg:sticky lg:top-24 lg:col-span-3 lg:self-start"
              id={`month-${month}`}
            >
              {monthName(month)}
            </h2>
            <ol className="flex flex-col gap-3 lg:col-span-9">
              {entries.map((entry) => {
                const slug = productSlug(entry.href);
                return (
                  <li key={`${entry.date}-${entry.title}`}>
                    <Link
                      className="group flex items-start gap-4 rounded-xl border bg-card p-4 shadow-xs/5 transition-colors hover:bg-accent/50 sm:p-5"
                      href={entry.href}
                    >
                      <ProductTile className="max-sm:hidden" slug={slug ?? "other"} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                          <span className="flex items-center gap-1.5 font-heading font-semibold text-lg tracking-[-0.01em]">
                            {entry.title}
                            <ArrowRightIcon
                              aria-hidden
                              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                            />
                          </span>
                          <time
                            className="font-mono text-muted-foreground text-xs tabular-nums"
                            dateTime={entry.date}
                          >
                            {entry.date}
                          </time>
                        </span>
                        <span className="text-pretty text-muted-foreground leading-snug">
                          {entry.body}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </Container>
    </Page>
  );
}
