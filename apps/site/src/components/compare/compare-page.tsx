import { Button } from "@coss/ui/components/button";
import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import type { Competitor } from "@/lib/compare";
import { briefCell } from "@/lib/compare-briefs";
import { productBySlug } from "@/lib/marketing";
import { articleSchema, breadcrumbSchema, faqSchema } from "@/lib/seo";
import { JsonLd } from "../json-ld";
import {
  Band,
  Close,
  Crumbs,
  FaqList,
  Heading,
  Hero,
  HeroActions,
  OnwardLinks,
  Page,
  Tray,
} from "../marketing/kit";
import { CompareRows } from "./compare-rows";

/** "2026-10-30" → "October 30, 2026". */
function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

/** "2026-10-30" → "Oct 30, 2026". */
function shortDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

/** A side's cell: stacked under the row's label on a phone, named by `data-side`. */

/**
 * A comparison (/compare/<slug>): the verdict, the table side by side, when to choose each, how to
 * move, the FAQ and the sources with the date they were checked. Grayscale, with no win/loss
 * colours: the rows speak for themselves.
 */
export function ComparePage({ competitor: c, url }: { competitor: Competitor; url: string }) {
  const products = c.products.flatMap((slug) => {
    const page = productBySlug(slug);
    return page ? [{ slug, page }] : [];
  });
  const lead = products[0]?.page;
  const title = `coss.com vs ${c.name}`;
  const checked = <time dateTime={c.checked}>{formatDate(c.checked)}</time>;
  return (
    <Page>
      <JsonLd
        data={articleSchema({ title, description: c.verdict, path: url, modified: c.checked })}
      />
      <JsonLd
        data={breadcrumbSchema([
          ["Compare", "/compare"],
          [title, url],
        ])}
      />
      <JsonLd data={faqSchema(c.faq)} />
      <Crumbs trail={[["Compare", "/compare"], [`vs ${c.name}`]]} />
      <Hero
        actions={<HeroActions docs={lead?.data.docs ?? "/docs"} />}
        headline={title}
        lede={<p>{c.verdict}</p>}
      >
        <Tray
          flush
          meta={
            <>
              Checked <time dateTime={c.checked}>{shortDate(c.checked)}</time>.{" "}
              <a className="underline underline-offset-4" href="#sources">
                Sources
              </a>
            </>
          }
          title="At a glance"
        >
          <CompareRows
            name={c.name}
            rows={c.rows.map((row) => ({
              ...row,
              coss: briefCell(row.coss),
              them: briefCell(row.them),
            }))}
          />
        </Tray>
      </Hero>

      <Band>
        <Heading
          id="choose-title"
          lede="Both are good at what they do. Here is where each one fits better."
          title="Which to choose"
        />
        <div className="grid gap-6 md:grid-cols-2">
          {(
            [
              [`Choose ${c.name} when`, c.chooseThem],
              ["Choose coss.com when", c.chooseCoss],
            ] as const
          ).map(([heading, items]) => (
            <Tray key={heading} title={heading}>
              <ul className="flex flex-col gap-4">
                {items.map((item) => (
                  <li key={item.title}>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-0.5 text-muted-foreground text-sm leading-snug">{item.body}</p>
                  </li>
                ))}
              </ul>
            </Tray>
          ))}
        </div>
      </Band>

      <Band muted>
        <Heading id="move-title" title={`Moving from ${c.name}`} />
        <ol className="grid gap-x-8 gap-y-6 md:grid-cols-3">
          {c.migration.map((step, index) => (
            <li className="flex gap-3" key={step.title}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-card font-mono text-xs tabular-nums shadow-xs/5">
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-snug">{step.body}</p>
                {step.href ? (
                  <Link
                    className="w-fit font-medium text-sm underline underline-offset-4"
                    href={step.href}
                  >
                    Read the guide
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Band>

      <FaqList faq={c.faq} />

      <Band className="sm:pt-0" id="sources">
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <Heading
              id="sources-title"
              lede={
                <>
                  {c.name}'s facts were checked on {checked}. Their pages are the final word on
                  their prices and features.
                </>
              }
              title="Sources"
            />
          </div>
          <ul className="flex flex-col gap-1 lg:col-span-8">
            {c.sources.map((source) => (
              <li key={source.href}>
                <Button
                  className="h-auto min-h-8 w-full justify-between whitespace-normal py-1.5 text-left"
                  render={<a href={source.href} rel="noopener noreferrer" target="_blank" />}
                  variant="ghost"
                >
                  {source.label}
                  <ArrowUpRightIcon aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      <OnwardLinks
        id="products-title"
        links={products.map((product) => ({
          href: product.page.url,
          title: product.page.data.title,
        }))}
        title="The coss.com side"
      />
      <Close title={`Try coss.com next to ${c.name}.`}>
        <p>
          A development key costs nothing and delivers nothing, so you can compare with real code.
        </p>
      </Close>
    </Page>
  );
}
