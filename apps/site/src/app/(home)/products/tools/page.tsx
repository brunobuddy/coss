import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { LinkGrid, Sheet } from "@/components/marketing-page";
import { SectionHead } from "@/components/sheet";
import { breadcrumbSchema, itemListSchema, pageMetadata } from "@/lib/seo";
import { FREE_TOOLS, TOOLS_ROUTE } from "@/lib/tools";

export const metadata: Metadata = pageMetadata({
  title: "Free developer tools for email, SMS and webhooks · coss.com",
  description:
    "Free tools from coss.com: an SMS segment calculator, a webhook signature verifier and a DMARC record generator. They run in your browser, with no account.",
  path: TOOLS_ROUTE,
});

export default function ToolsPage() {
  return (
    <Sheet>
      <JsonLd
        data={breadcrumbSchema([
          ["Products", "/products"],
          ["Free tools", TOOLS_ROUTE],
        ])}
      />
      <JsonLd
        data={itemListSchema(FREE_TOOLS.map((tool) => [tool.name, `${TOOLS_ROUTE}/${tool.slug}`]))}
      />
      <section className="border-b">
        <SectionHead as="h1" id="tools-title" title="Free tools">
          <p>
            Small tools for the fiddly parts of email, SMS and webhooks. They run in your browser,
            so there's no account and nothing you paste leaves the page.
          </p>
        </SectionHead>
      </section>
      <LinkGrid
        id="tools-list"
        links={FREE_TOOLS.map((tool) => ({
          href: `${TOOLS_ROUTE}/${tool.slug}`,
          title: tool.name,
          description: tool.description,
        }))}
        title="Tools"
      />
    </Sheet>
  );
}
