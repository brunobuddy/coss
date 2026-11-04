import { PLANS } from "@coss/billing/catalog";
import { Button } from "@coss/ui/components/button";
import { Card, CardPanel } from "@coss/ui/components/card";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { EmailEstimator } from "@/components/pricing/email-estimator";
import { PlanCards } from "@/components/pricing/plan-cards";
import { PlanComparison } from "@/components/pricing/plan-comparison";
import { PricingFaq, pricingFaq } from "@/components/pricing/pricing-faq";
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

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-6">
      <header className="flex max-w-2xl flex-col gap-2">
        <h2 className="font-semibold text-2xl tracking-tight" id={id}>
          {title}
        </h2>
        {description && <p className="text-pretty text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export default function PricingPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-4 py-16 sm:py-24">
      <JsonLd data={faqSchema(pricingFaq())} />
      <JsonLd data={pricingSchema(DESCRIPTION)} />
      <JsonLd data={breadcrumbSchema([["Pricing", "/pricing"]])} />
      <div className="flex flex-col gap-12">
        <header className="flex max-w-2xl flex-col gap-4">
          <h1 className="font-semibold text-4xl tracking-tight sm:text-5xl">Pricing</h1>
          <p className="text-pretty text-lg text-muted-foreground">
            Start free with {FREE_EMAILS} emails a month. On paid plans, the monthly fee is credit
            for usage of any product, so you pay the larger of the fee and what you use.
          </p>
        </header>
        <PlanCards />
        <p className="text-muted-foreground text-sm">
          Every plan includes sandbox environments (never billed), webhooks, logs, open and click
          tracking, and scheduled and batch sends.
        </p>
      </div>

      <Section
        description="Enter your monthly email volume to see what it costs on each plan."
        id="estimate"
        title="Estimate your bill"
      >
        <EmailEstimator />
      </Section>

      <Section
        description={
          <>
            Usage beyond a paid plan&apos;s credit is billed at these rates. Volume pricing is
            graduated: each band is priced at its own rate, so there&apos;s no cliff. Bands start
            over each calendar month (UTC).
          </>
        }
        id="rates"
        title="Usage rates"
      >
        <UsageRateCards />
      </Section>

      <Section
        description="SMS is priced per segment: 160 plain characters, or 70 with emoji or other Unicode (153 and 67 per segment in longer messages, 152 and 66 from toll-free numbers). Sends are priced by the destination country, replies by the country of the number that receives them."
        id="sms"
        title="SMS rates"
      >
        <SmsRateTable rates={smsRates()} />
      </Section>

      <Section id="compare" title="Compare plans">
        <PlanComparison />
      </Section>

      <Section id="faq" title="Questions">
        <PricingFaq />
      </Section>

      <Card>
        <CardPanel className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-xl flex-col gap-2">
            <h2 className="font-semibold text-xl tracking-tight">{PLANS.enterprise.name}</h2>
            <p className="text-pretty text-muted-foreground">
              Annual contracts from {formatPrice(PLANS.enterprise.feeCents)} a month: volume rates
              and committed spend, directory sync, invoicing with payment terms and direct debit.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button render={<a href={`mailto:${SALES_EMAIL}`} />}>Contact sales</Button>
            <Button render={<Link href="/docs/billing" />} variant="outline">
              How billing works
            </Button>
          </div>
        </CardPanel>
      </Card>
    </main>
  );
}
