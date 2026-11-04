import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Sheet } from "@/components/marketing-page";
import { SectionHead } from "@/components/sheet";
import { CHANGELOG, CHANGELOG_ROUTE } from "@/lib/changelog";
import { breadcrumbSchema, pageMetadata } from "@/lib/seo";

const base = pageMetadata({
  title: "Changelog: what shipped on coss.com",
  description:
    "New coss.com products and features, newest first: email, SMS, inboxes, scheduling, forms, e-signatures, one-time codes, webhooks and risk checks.",
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

export default function ChangelogPage() {
  return (
    <Sheet>
      <JsonLd data={breadcrumbSchema([["Changelog", CHANGELOG_ROUTE]])} />
      <section className="border-b">
        <SectionHead as="h1" id="changelog-title" title="Changelog">
          <p>
            What shipped, newest first. Follow it with the{" "}
            <a href={`${CHANGELOG_ROUTE}/rss.xml`}>RSS feed</a>. An API version's breaking changes
            are in the <Link href="/docs/api-reference/changelog">API changelog</Link>.
          </p>
        </SectionHead>
      </section>
      <ol className="border-b">
        {CHANGELOG.map((entry) => (
          <li
            className="grid gap-2 border-b px-4 py-8 last:border-b-0 sm:px-8 lg:grid-cols-12 lg:gap-10"
            key={`${entry.date}-${entry.title}`}
          >
            <time
              className="font-mono text-muted-foreground text-sm lg:col-span-2"
              dateTime={entry.date}
            >
              {entry.date}
            </time>
            <div className="flex max-w-2xl flex-col gap-2 lg:col-span-10">
              <h2 className="font-semibold text-xl tracking-[-0.01em]">
                <Link className="hover:underline" href={entry.href}>
                  {entry.title}
                </Link>
              </h2>
              <p className="text-muted-foreground leading-snug">{entry.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
