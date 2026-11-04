import { Button } from "@coss/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
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

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 border-t pt-10 lg:grid-cols-12 lg:gap-10">
      <h2 className="font-semibold text-2xl tracking-tight lg:col-span-4" id={id}>
        {title}
      </h2>
      <div className="flex max-w-2xl flex-col gap-4 text-pretty text-lg text-muted-foreground leading-snug lg:col-span-8">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-16 sm:py-24">
      <JsonLd data={aboutPageSchema(DESCRIPTION)} />
      <header className="flex max-w-3xl flex-col gap-5">
        <h1 className="text-balance font-semibold text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95] tracking-[-0.035em]">
          {ABOUT_TITLE}
        </h1>
        <p className="text-pretty text-muted-foreground text-xl leading-snug">
          {ABOUT_LEDE.before}{" "}
          <strong className="font-semibold text-foreground">{ABOUT_LEDE.strong}</strong>{" "}
          {ABOUT_LEDE.after}
        </p>
      </header>

      {ABOUT_SECTIONS.map((section) => (
        <Section id={section.id} key={section.id} title={section.title}>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {"products" in section ? (
            <ul className="flex flex-col divide-y border-y text-base">
              {ABOUT_PRODUCTS.map((product) => (
                <li className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4" key={product.id}>
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{product.name}</span>
                    <code className="font-mono text-muted-foreground text-xs">{product.call}</code>
                  </span>
                  <span>{product.summary}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {"closing" in section ? <p>{section.closing}</p> : null}
          {"actions" in section ? (
            <div className="flex flex-wrap gap-2.5 pt-2">
              <SignUpButton />
              <Button className="px-4" render={<Link href="/docs/quickstart" />} variant="outline">
                Quickstart
              </Button>
              <Button render={<Link href="/pricing" />} variant="ghost">
                Pricing
              </Button>
            </div>
          ) : null}
        </Section>
      ))}
    </main>
  );
}
