import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Band, Close, Hero, Page } from "@/components/marketing/kit";
import { COMPARE_ROUTE, COMPETITORS } from "@/lib/compare";
import { productBySlug } from "@/lib/marketing";
import { PRODUCT_GROUPS } from "@/lib/marks";
import { breadcrumbSchema, itemListSchema, pageMetadata } from "@/lib/seo";

const DESCRIPTION =
  "coss.com compared with Resend, SendGrid, Postmark, Mailgun, Amazon SES, Twilio, Svix, DocuSign and more: features, pricing and when each is the better choice.";

export const metadata = pageMetadata({
  title: "Compare coss.com with Resend, SendGrid, Twilio and more",
  description: DESCRIPTION,
  path: COMPARE_ROUTE,
  ownImage: true,
});

export default function CompareIndex() {
  const groups = PRODUCT_GROUPS.map((group) => ({
    group,
    competitors: COMPETITORS.filter(
      (competitor) => productBySlug(competitor.products[0] ?? "")?.data.group === group,
    ),
  })).filter(({ competitors }) => competitors.length > 0);
  return (
    <Page>
      <JsonLd data={breadcrumbSchema([["Compare", COMPARE_ROUTE]])} />
      <JsonLd
        data={itemListSchema(
          COMPETITORS.map((c) => [`coss.com vs ${c.name}`, `${COMPARE_ROUTE}/${c.slug}`]),
        )}
      />
      <Hero
        headline="See how coss.com compares."
        lede={<p>Side by side, with the date every fact was checked and where it came from.</p>}
      />
      <Band className="sm:pt-16">
        <div className="flex flex-col gap-12">
          {groups.map(({ group, competitors }) => (
            <section
              aria-labelledby={`group-${group.toLowerCase()}`}
              className="grid gap-4 lg:grid-cols-12 lg:gap-8"
              key={group}
            >
              <h2
                className="font-heading font-semibold text-2xl tracking-[-0.01em] lg:col-span-3"
                id={`group-${group.toLowerCase()}`}
              >
                {group}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-9 lg:grid-cols-3">
                {competitors.map((competitor) => (
                  <li key={competitor.slug}>
                    <Link
                      className="group flex h-full items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs/5 transition-colors hover:bg-accent/50"
                      href={`${COMPARE_ROUTE}/${competitor.slug}`}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        vs {competitor.name}
                      </span>
                      <ArrowRightIcon
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Band>
      <Close title="Compare with real code.">
        <p>A development key costs nothing and delivers nothing.</p>
      </Close>
    </Page>
  );
}
