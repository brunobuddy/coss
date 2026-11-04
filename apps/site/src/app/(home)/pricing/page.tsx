import { PLANS } from "@coss/billing/catalog";
import { Button } from "@coss/ui/components/button";
import { CardFrame } from "@coss/ui/components/card";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Band, FaqList, Heading, Hero, Page, Tray } from "@/components/marketing/kit";
import { EmailEstimator } from "@/components/pricing/email-estimator";
import { PlanCards } from "@/components/pricing/plan-cards";
import { PlanComparison } from "@/components/pricing/plan-comparison";
import { pricingFaq } from "@/components/pricing/pricing-faq";
import { SmsRateTable } from "@/components/pricing/sms-rates";
import { UsageRateCards } from "@/components/pricing/usage-rates";
import { formatPrice, smsRates } from "@/lib/pricing";
import { breadcrumbSchema, faqSchema, pageMetadata, pricingSchema } from "@/lib/seo";
import { SALES_EMAIL } from "@/lib/site";

const FREE_EMAILS = (PLANS.free.includedUnits["email.recipients"] ?? 0).toLocaleString("en-US");

const DESCRIPTION = `Start free with ${FREE_EMAILS} emails a month. Paid plans turn their monthly fee into credit for usage of any coss.com product.`;

export const metadata: Metadata = pageMetadata({
  title: "Pricing: free plan and usage rates · coss.com",
  description: DESCRIPTION,
  path: "/pricing",
  markdown: "/pricing.md",
});

export default function PricingPage() {
  return (
    <Page>
      <JsonLd data={faqSchema(pricingFaq())} />
      <JsonLd data={pricingSchema(DESCRIPTION)} />
      <JsonLd data={breadcrumbSchema([["Pricing", "/pricing"]])} />
      <Hero
        headline="Start free. Your monthly fee is credit."
        lede={
          <p>
            {FREE_EMAILS} emails a month for free. On paid plans, the fee is credit for usage of any
            product, so you pay the larger of the fee and what you use.
          </p>
        }
      >
        <div className="flex flex-col gap-4">
          <PlanCards />
          <p className="text-pretty text-center text-muted-foreground text-sm">
            Every plan includes sandbox environments (never billed), webhooks, logs, open and click
            tracking, and scheduled and batch sends.
          </p>
        </div>
      </Hero>

      <Band className="mt-16 sm:mt-24" id="estimate" muted>
        <Heading
          id="estimate-title"
          lede="Enter your monthly email volume to see what it costs on each plan."
          title="Estimate your bill"
        />
        <Tray flush>
          <EmailEstimator />
        </Tray>
      </Band>

      <Band id="rates">
        <Heading
          id="rates-title"
          lede="Usage beyond a paid plan's credit is billed at these rates. Each band is priced at its own rate, so there's no cliff, and bands start over each calendar month (UTC)."
          title="Usage rates"
        />
        <UsageRateCards />
      </Band>

      <Band id="sms">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="flex flex-col gap-4 lg:col-span-5">
            <Heading
              id="sms-title"
              lede="Priced per segment. Sends by the destination country, replies by the country of the number that receives them."
              title="SMS rates"
            />
            <p className="text-pretty text-muted-foreground text-sm leading-snug">
              A segment is 160 plain characters, or 70 with emoji or other Unicode (153 and 67 per
              segment in longer messages, 152 and 66 from toll-free numbers).
            </p>
            <Button
              className="self-start"
              render={<Link href="/products/tools/sms-segment-calculator" />}
              variant="outline"
            >
              Count a message&apos;s segments
            </Button>
          </div>
          <div className="min-w-0 lg:col-span-7">
            <Tray flush>
              <SmsRateTable rates={smsRates()} />
            </Tray>
          </div>
        </div>
      </Band>

      <Band id="compare" muted>
        <Heading id="compare-title" title="Compare plans" />
        <Tray flush>
          <PlanComparison />
        </Tray>
      </Band>

      <FaqList faq={pricingFaq()} />

      <Band>
        <CardFrame className="items-center gap-5 px-4 py-14 text-center sm:px-10 sm:py-16">
          <h2 className="relative text-balance font-heading font-semibold text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] tracking-[-0.012em]">
            {PLANS.enterprise.name}
          </h2>
          <p className="relative max-w-xl text-pretty text-lg text-muted-foreground leading-snug">
            Annual contracts from {formatPrice(PLANS.enterprise.feeCents)} a month: volume rates and
            committed spend, directory sync, invoicing with payment terms and direct debit.
          </p>
          <div className="relative flex flex-wrap justify-center gap-2.5">
            <Button className="px-5" render={<a href={`mailto:${SALES_EMAIL}`} />} size="lg">
              Contact sales
            </Button>
            <Button
              className="px-5"
              render={<Link href="/docs/billing" />}
              size="lg"
              variant="outline"
            >
              How billing works
            </Button>
          </div>
        </CardFrame>
      </Band>
    </Page>
  );
}
