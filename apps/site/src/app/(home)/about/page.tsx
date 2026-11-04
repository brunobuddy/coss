import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { CheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import {
  Band,
  Close,
  FeatureRow,
  Heading,
  Hero,
  Page,
  ProductTile,
  Tray,
} from "@/components/marketing/kit";
import { SignUpButton } from "@/components/sign-up-button";
import { ABOUT_LEDE, ABOUT_PRODUCTS, ABOUT_SECTIONS, ABOUT_TITLE } from "@/lib/about";
import { aboutPageSchema, pageMetadata } from "@/lib/seo";

const DESCRIPTION =
  "coss.com is one API key and one SDK for the application layer: email, SMS, inboxes, scheduling and more, built by the team behind Cal.com.";

export const metadata: Metadata = pageMetadata({
  title: "About coss.com: one API above your database",
  description: DESCRIPTION,
  path: "/about",
  markdown: "/about.md",
});

/** The stack the page argues for: coss.com above the database, which stays where it is. */
function Layers() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 rounded-2xl bg-muted/72 p-1">
      <div className="relative flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs/5 sm:p-6">
        <p className="flex items-baseline justify-between gap-4">
          <span className="font-heading font-semibold text-xl">coss.com</span>
          <span className="font-mono text-muted-foreground text-xs">
            one key, one SDK, one bill
          </span>
        </p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ABOUT_PRODUCTS.map((product) => (
            <li className="flex items-center gap-2.5 text-sm" key={product.id}>
              <ProductTile size="sm" slug={product.id} />
              {product.name}
            </li>
          ))}
        </ul>
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3.5 text-sm sm:px-6">
        <span className="font-medium">Your database</span>
        <span className="text-muted-foreground">Supabase, Neon, RDS, a box under your desk</span>
      </p>
    </div>
  );
}

/** What every extra vendor brings with it. */
const PER_VENDOR = ["Account", "Key", "Dashboard", "Webhook format", "Retry rules", "Invoice"];

function FourVendors() {
  return (
    <Tray flush title="Four vendors to ship one product">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2.5 ps-4 text-left font-normal text-muted-foreground">
                <span className="sr-only">Each vendor brings</span>
              </th>
              {ABOUT_PRODUCTS.slice(0, 4).map((product) => (
                <th className="px-2 py-2.5 text-center font-normal" key={product.id}>
                  <span className="sr-only">{product.name}</span>
                  <ProductTile size="sm" slug={product.id} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PER_VENDOR.map((thing) => (
              <tr className="border-b last:border-b-0" key={thing}>
                <th className="py-2.5 ps-4 text-left font-normal" scope="row">
                  {thing}
                </th>
                {ABOUT_PRODUCTS.slice(0, 4).map((product) => (
                  <td className="px-2 py-2.5 text-center text-muted-foreground" key={product.id}>
                    <span className="sr-only">Its own</span>
                    <CheckIcon aria-hidden className="mx-auto size-3.5" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tray>
  );
}

const [DATA_LAYER, APPLICATION_LAYER, ONE_VENDOR, OPEN] = ABOUT_SECTIONS;

/** The pieces behind the products, from the section's closing sentence (shared with `/about.md`). */
const SHARED_PIECES = [
  "Verified domains",
  "Receiving",
  "Suppressions",
  "DMARC and reputation",
  "Delivery logs and drains",
  "Signed webhooks",
  "Audit log",
  "Metered billing",
];

export default function AboutPage() {
  return (
    <Page>
      <JsonLd data={aboutPageSchema(DESCRIPTION)} />
      <Hero
        actions={
          <>
            <SignUpButton size="lg" />
            <Button
              className="px-5"
              render={<Link href="/docs/quickstart" />}
              size="lg"
              variant="outline"
            >
              Quickstart
            </Button>
          </>
        }
        headline={ABOUT_TITLE}
        lede={<p>{ABOUT_LEDE.after}</p>}
      >
        <Layers />
      </Hero>

      <Band className="mt-8">
        <div className="flex flex-col gap-16 sm:gap-24">
          <FeatureRow
            body="Supabase folded the plumbing into a project URL and an API key, kept Postgres at the centre, and open-sourced the lot. coss.com runs on Postgres too, and we have no plans to host yours."
            title={DATA_LAYER.title}
          >
            <Tray title="Keep your database where it is">
              <ul className="flex flex-wrap gap-2">
                {["Supabase", "Neon", "RDS", "A box under your desk"].map((place) => (
                  <li key={place}>
                    <Badge size="lg" variant="outline">
                      {place}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Tray>
          </FeatureRow>
          <FeatureRow
            body="A working product still has to reach people, and each way of reaching them has been a separate vendor. That means four places to look when something doesn't arrive."
            reverse
            title={APPLICATION_LAYER.title}
          >
            <FourVendors />
          </FeatureRow>
        </div>
      </Band>

      <Band muted>
        <Heading
          id={ONE_VENDOR.id}
          lede="One key, one SDK namespace, the same webhooks, logs, rate limits, idempotency and API versioning. Learn one and you know them all."
          title={ONE_VENDOR.title}
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ABOUT_PRODUCTS.map((product) => (
            <li key={product.id}>
              <Link
                className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs/5 transition-colors hover:bg-accent/50"
                href={`/products/${product.id}`}
              >
                <span className="flex items-center gap-2.5">
                  <ProductTile size="sm" slug={product.id} />
                  <span className="font-medium">{product.name}</span>
                  <code className="ms-auto font-mono text-muted-foreground text-xs">
                    {product.call}
                  </code>
                </span>
                <span className="text-pretty text-muted-foreground text-sm leading-snug">
                  {product.summary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-muted-foreground text-sm">
            Built once and shared, not reinvented per product
          </p>
          <ul className="flex max-w-3xl flex-wrap justify-center gap-2">
            {SHARED_PIECES.map((piece) => (
              <li key={piece}>
                <Badge size="lg" variant="outline">
                  {piece}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      <Close title={OPEN.title}>
        {OPEN.paragraphs.map((paragraph) => (
          <p className="mt-2 first:mt-0" key={paragraph}>
            {paragraph}
          </p>
        ))}
      </Close>
    </Page>
  );
}
