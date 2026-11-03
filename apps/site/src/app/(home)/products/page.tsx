import { JsonLd } from "@/components/json-ld";
import { LinkGrid, MarketingClose, Sheet } from "@/components/marketing-page";
import { SectionHead } from "@/components/sheet";
import { PRODUCTS_ROUTE, productPages } from "@/lib/marketing";
import { PRODUCT_GROUPS } from "@/lib/marks";
import { breadcrumbSchema, pageMetadata } from "@/lib/seo";

const DESCRIPTION =
  "Every coss.com product: email, inboxes for AI agents, SMS, one-time codes, e-signatures, forms, scheduling, webhooks and risk checks, on one API key and SDK.";

export const metadata = pageMetadata({
  title: "Products: one API for email, SMS, inboxes, signatures and more · coss.com",
  description: DESCRIPTION,
  path: PRODUCTS_ROUTE,
  ownImage: true,
});

export default function ProductsPage() {
  const pages = productPages();
  return (
    <Sheet>
      <JsonLd data={breadcrumbSchema([["Products", PRODUCTS_ROUTE]])} />
      <section className="border-b">
        <SectionHead as="h1" id="products-title" title="Products">
          <p>
            Every product runs on the same key, the same SDK, the same signed webhooks and the same
            log, so the next one you add needs no new setup.
          </p>
        </SectionHead>
      </section>
      {PRODUCT_GROUPS.map((group) => (
        <LinkGrid
          id={`group-${group.toLowerCase()}`}
          key={group}
          links={pages
            .filter((page) => page.data.group === group)
            .map((page) => ({
              href: page.url,
              title: page.data.title,
              description: page.data.description ?? "",
              mark: page.data.mark,
              call: page.data.call,
            }))}
          title={group}
        />
      ))}
      <MarketingClose title="One key for all of it.">
        <p>Start with a development key: every product works in sandbox, and nothing is billed.</p>
      </MarketingClose>
    </Sheet>
  );
}
