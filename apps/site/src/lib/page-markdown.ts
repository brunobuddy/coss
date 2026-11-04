import "server-only";
import { pricingFaq } from "@/components/pricing/pricing-faq";
import { ABOUT_LEDE, ABOUT_PRODUCTS, ABOUT_SECTIONS, ABOUT_TITLE } from "./about";
import { renderBillingComponents } from "./billing-text";
import { SITE_DESCRIPTION, SITE_URL } from "./site";

/** The pricing page as Markdown (`/pricing.md`): every number comes from the billing catalog. */
export function pricingMarkdown(): string {
  const questions = pricingFaq()
    .map(({ question, answer }) => `### ${question}\n\n${answer}`)
    .join("\n\n");
  return renderBillingComponents(`# Pricing (${SITE_URL}/pricing)

> ${SITE_DESCRIPTION}

## Plans

<PlanTable />

## Usage rates

<UsageRates />

## Add-ons

<AddOns />

## Support

<SupportTable />

## Frequently asked questions

${questions}
`);
}

/** The about page as Markdown (`/about.md`). */
export function aboutMarkdown(): string {
  const sections = ABOUT_SECTIONS.map((section) => {
    const products =
      "products" in section
        ? ABOUT_PRODUCTS.map((p) => `- **${p.name}** (\`${p.call}\`): ${p.summary}`).join("\n")
        : null;
    const closing = "closing" in section ? section.closing : null;
    return [`## ${section.title}`, ...section.paragraphs, products, closing]
      .filter(Boolean)
      .join("\n\n");
  });
  return `# ${ABOUT_TITLE} (${SITE_URL}/about)

${ABOUT_LEDE.before} ${ABOUT_LEDE.strong} ${ABOUT_LEDE.after}

${sections.join("\n\n")}
`;
}
