import { Button } from "@coss/ui/components/button";
import { cn } from "@coss/ui/lib/utils";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Band, Close, Hero, Page } from "@/components/marketing/kit";
import { ProductCard } from "@/components/marketing/product-card";
import { SHOWCASES } from "@/components/products";
import { SignUpButton } from "@/components/sign-up-button";
import { PRODUCTS_ROUTE, type ProductPage, productPages } from "@/lib/marketing";
import { PRODUCT_GROUPS, type ProductGroup } from "@/lib/marks";
import { breadcrumbSchema, itemListSchema, pageMetadata } from "@/lib/seo";

const DESCRIPTION =
  "Every coss.com product: email, inboxes for AI agents, SMS, one-time codes, e-signatures, forms, scheduling, webhooks and risk checks, on one API key and SDK.";

export const metadata = pageMetadata({
  title: "Products: email, SMS, AI agent inboxes and more · coss.com",
  description: DESCRIPTION,
  path: PRODUCTS_ROUTE,
  ownImage: true,
});

/** The products that lead their group, widest first, each showing a piece of its interface. */
const LEADS: Record<string, string> = {
  email: "lg:col-span-7",
  inboxes: "lg:col-span-5",
  scheduling: "lg:col-span-7",
  sms: "lg:col-span-5",
  risk: "lg:col-span-12",
};

/** Everything else, by how many share the row left after a group's leads. */
const REST_SPAN: Record<ProductGroup, string> = {
  Email: "lg:col-span-3",
  Messaging: "lg:col-span-4",
  Trust: "lg:col-span-6",
  Platform: "lg:col-span-6",
  Developers: "lg:col-span-6",
};

/** Half-width groups: two small groups share a row. */
const SIDE_BY_SIDE: readonly ProductGroup[] = ["Platform", "Developers"];

function Group({ group, pages }: { group: ProductGroup; pages: ProductPage[] }) {
  const ordered = [
    ...pages.filter((page) => LEADS[page.slugs[0] ?? ""]),
    ...pages.filter((page) => !LEADS[page.slugs[0] ?? ""]),
  ];
  return (
    <section
      aria-labelledby={`group-${group.toLowerCase()}`}
      className="flex min-w-0 flex-col gap-5"
    >
      <h2
        className="font-heading font-semibold text-2xl tracking-[-0.01em] sm:text-3xl"
        id={`group-${group.toLowerCase()}`}
      >
        {group}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        {ordered.map((page) => {
          const slug = page.slugs[0] ?? "";
          const lead = LEADS[slug];
          return (
            <li
              className={cn("min-w-0", lead ? `sm:col-span-2 ${lead}` : REST_SPAN[group])}
              key={page.url}
            >
              <ProductCard
                call={lead ? page.data.call : undefined}
                href={page.url}
                lede={SHOWCASES[slug]?.lede || (page.data.description ?? "")}
                preview={Boolean(lead)}
                slug={slug}
                title={page.data.title ?? ""}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function ProductsPage() {
  const pages = productPages();
  const inGroup = (group: ProductGroup) => pages.filter((page) => page.data.group === group);
  return (
    <Page>
      <JsonLd data={breadcrumbSchema([["Products", PRODUCTS_ROUTE]])} />
      <JsonLd data={itemListSchema(pages.map((page) => [page.data.title ?? "", page.url]))} />
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
        headline="Every product, on one key."
        lede={
          <p>The same SDK, signed webhooks and log, so the next one you add needs no new setup.</p>
        }
      />
      <Band>
        <div className="flex flex-col gap-14 sm:gap-20">
          {PRODUCT_GROUPS.filter((group) => !SIDE_BY_SIDE.includes(group)).map((group) => (
            <Group group={group} key={group} pages={inGroup(group)} />
          ))}
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-8">
            {SIDE_BY_SIDE.map((group) => (
              <Group group={group} key={group} pages={inGroup(group)} />
            ))}
          </div>
        </div>
      </Band>
      <Close title="One key for all of it.">
        <p>Start with a development key: every product works in sandbox, and nothing is billed.</p>
      </Close>
    </Page>
  );
}
