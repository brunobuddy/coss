import { Button } from "@coss/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import { JsonLd } from "@/components/json-ld";
import { LinkGrid, Sheet } from "@/components/marketing-page";
import { SectionHead } from "@/components/sheet";
import { DmarcRecordChecker } from "@/components/tools/dmarc-record-checker";
import { SmsSegmentCalculator } from "@/components/tools/sms-segment-calculator";
import { WebhookSignatureVerifier } from "@/components/tools/webhook-signature-verifier";
import { abs, breadcrumbSchema, pageMetadata } from "@/lib/seo";
import { FREE_TOOLS, TOOLS_ROUTE, toolBySlug } from "@/lib/tools";

const TOOL_UI: Record<string, ComponentType> = {
  "sms-segment-calculator": SmsSegmentCalculator,
  "webhook-signature-verifier": WebhookSignatureVerifier,
  "dmarc-record-checker": DmarcRecordChecker,
};

export const dynamicParams = false;

export function generateStaticParams() {
  return FREE_TOOLS.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/products/tools/[slug]">): Promise<Metadata> {
  const tool = toolBySlug((await params).slug);
  if (!tool) notFound();
  return pageMetadata({
    title: tool.title,
    description: tool.description,
    path: `${TOOLS_ROUTE}/${tool.slug}`,
  });
}

export default async function ToolPage({ params }: PageProps<"/products/tools/[slug]">) {
  const tool = toolBySlug((await params).slug);
  const Tool = tool && TOOL_UI[tool.slug];
  if (!tool || !Tool) notFound();
  const path = `${TOOLS_ROUTE}/${tool.slug}`;
  return (
    <Sheet>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: tool.name,
          description: tool.description,
          url: abs(path),
          applicationCategory: "DeveloperApplication",
          browserRequirements: "Requires JavaScript",
          offers: { "@type": "Offer", price: "0.00", priceCurrency: "USD" },
        }}
      />
      <JsonLd
        data={breadcrumbSchema([
          ["Products", "/products"],
          ["Free tools", TOOLS_ROUTE],
          [tool.name, path],
        ])}
      />
      <section className="border-b">
        <SectionHead as="h1" id="tool-title" title={tool.name}>
          <p>{tool.lede}</p>
        </SectionHead>
        <Tool />
        <div className="flex flex-wrap gap-2.5 border-t px-4 py-6 sm:px-8">
          <Button render={<Link href={tool.product.href} />} variant="outline">
            {tool.product.label}
          </Button>
          <Button render={<Link href={tool.docs.href} />} variant="ghost">
            {tool.docs.label}
          </Button>
        </div>
      </section>
      <LinkGrid
        id="other-tools"
        links={FREE_TOOLS.filter((other) => other.slug !== tool.slug).map((other) => ({
          href: `${TOOLS_ROUTE}/${other.slug}`,
          title: other.name,
          description: other.description,
        }))}
        title="Other tools"
      />
    </Sheet>
  );
}
