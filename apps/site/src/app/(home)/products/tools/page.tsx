import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { StatusDot } from "@/components/marketing/demo";
import { Crumbs, Hero, Page, Tray } from "@/components/marketing/kit";
import { breadcrumbSchema, itemListSchema, pageMetadata } from "@/lib/seo";
import { FREE_TOOLS, TOOLS_ROUTE } from "@/lib/tools";

export const metadata: Metadata = pageMetadata({
  title: "Free developer tools for email, SMS and webhooks · coss.com",
  description:
    "Free tools from coss.com: an SMS segment calculator, a webhook signature verifier and a DMARC record generator. They run in your browser, with no account.",
  path: TOOLS_ROUTE,
});

/** What each tool hands back, as a glimpse of it on its card. */
const PREVIEWS: Record<string, ReactNode> = {
  "sms-segment-calculator": (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <dt className="text-muted-foreground text-xs">Segments</dt>
        <dd className="font-mono text-xl">2</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Encoding</dt>
        <dd className="font-mono text-xl">UCS-2</dd>
      </div>
    </dl>
  ),
  "webhook-signature-verifier": (
    <p className="flex flex-col gap-2 text-sm">
      <StatusDot tone="success">Valid</StatusDot>
      <code className="truncate font-mono text-muted-foreground text-xs">v1,K5oZfzN95Z…</code>
    </p>
  ),
  "dmarc-record-checker": (
    <p className="flex flex-col gap-2 text-sm">
      <StatusDot tone="success">This record is valid.</StatusDot>
      <code className="truncate font-mono text-muted-foreground text-xs">
        v=DMARC1; p=reject; rua=mailto:…
      </code>
    </p>
  ),
};

export default function ToolsPage() {
  return (
    <Page>
      <JsonLd
        data={breadcrumbSchema([
          ["Products", "/products"],
          ["Free tools", TOOLS_ROUTE],
        ])}
      />
      <JsonLd
        data={itemListSchema(FREE_TOOLS.map((tool) => [tool.name, `${TOOLS_ROUTE}/${tool.slug}`]))}
      />
      <Crumbs trail={[["Products", "/products"], ["Free tools"]]} />
      <Hero
        headline="Free tools"
        lede={
          <p>
            Small tools for the fiddly parts of email, SMS and webhooks. They run in your browser,
            so there's no account and nothing you paste leaves the page.
          </p>
        }
      >
        <ul className="grid gap-6 pb-16 sm:pb-24 md:grid-cols-3">
          {FREE_TOOLS.map((tool) => (
            <li key={tool.slug}>
              <Link
                className="group flex h-full flex-col gap-4"
                href={`${TOOLS_ROUTE}/${tool.slug}`}
              >
                <Tray bodyClassName="min-h-24 justify-center" title={tool.name}>
                  {PREVIEWS[tool.slug]}
                </Tray>
                <span className="flex flex-col gap-1.5 px-1">
                  <span className="flex items-center gap-1.5 font-medium text-sm group-hover:underline">
                    Open the tool
                    <ArrowRightIcon
                      aria-hidden
                      className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                  <span className="text-pretty text-muted-foreground text-sm leading-snug">
                    {tool.description}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Hero>
    </Page>
  );
}
