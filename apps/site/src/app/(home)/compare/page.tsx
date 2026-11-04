import { JsonLd } from "@/components/json-ld";
import { LinkGrid, MarketingClose, Sheet } from "@/components/marketing-page";
import { SectionHead } from "@/components/sheet";
import { COMPARE_ROUTE, COMPETITORS } from "@/lib/compare";
import { productBySlug } from "@/lib/marketing";
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
  return (
    <Sheet>
      <JsonLd data={breadcrumbSchema([["Compare", COMPARE_ROUTE]])} />
      <JsonLd
        data={itemListSchema(
          COMPETITORS.map((c) => [`coss.com vs ${c.name}`, `${COMPARE_ROUTE}/${c.slug}`]),
        )}
      />
      <section className="border-b">
        <SectionHead as="h1" id="compare-title" title="Compare">
          <p>
            How coss.com compares with the services you may use today, side by side, with the date
            every fact was checked and where it came from.
          </p>
        </SectionHead>
      </section>
      <LinkGrid
        id="compare-list"
        links={COMPETITORS.map((competitor) => {
          const product = productBySlug(competitor.products[0] ?? "");
          return {
            href: `${COMPARE_ROUTE}/${competitor.slug}`,
            title: `vs ${competitor.name}`,
            description: competitor.verdict,
            mark: product?.data.mark,
            call: product?.data.call,
          };
        })}
        title="Comparisons"
      />
      <MarketingClose title="Compare with real code." />
    </Sheet>
  );
}
