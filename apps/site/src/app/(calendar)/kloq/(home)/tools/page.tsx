import { Button } from "@coss/ui/components/button";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InstallCta, PlanCopy } from "@/components/calendar/landing/plan-copy";
import { Reveal } from "@/components/calendar/landing/reveal";
import { PageHero } from "@/components/calendar/site/page-hero";
import { Section, SectionHead } from "@/components/calendar/site/section";
import { ToolLinks } from "@/components/calendar/tools/tool-shell";
import { JsonLd } from "@/components/json-ld";
import { CALENDAR } from "@/lib/calendar";
import { abs, canonical, OG_IMAGE } from "@/lib/calendar/site";
import { TOOLS } from "@/lib/calendar/tools";
import { breadcrumbSchema, itemListSchema } from "@/lib/seo";

const TITLE = "Free calendar and date tools: RRULE, time zones, easing";
const DESCRIPTION =
  "Five tools built from kloq's internals: an RRULE explainer and builder, a time zone overlap map, a spring-to-CSS generator and a natural-language date parser.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: canonical("/kloq/tools"),
  openGraph: {
    images: [OG_IMAGE],
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: abs("/kloq/tools"),
  },
  twitter: {
    card: "summary_large_image",
    images: [OG_IMAGE],
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Tools() {
  return (
    <div className="flex flex-1 flex-col">
      <JsonLd
        data={breadcrumbSchema([
          [CALENDAR.name, CALENDAR.path],
          ["Tools", "/kloq/tools"],
        ])}
      />
      <JsonLd data={itemListSchema(TOOLS.map((tool) => [tool.name, `/kloq/tools/${tool.slug}`]))} />
      <main className="flex flex-1 flex-col">
        <PageHero
          eyebrow={[
            "tools",
            <span key="free" className="text-foreground">
              free
            </span>,
            "no account, nothing leaves your browser",
          ]}
          title="Five functions, taken out of the calendar."
          lede="A calendar has to solve some genuinely annoying problems that have nothing to do with calendars: what a recurrence rule means and how to write one, what easing a spring makes, which words in a sentence were a date, when everyone is awake at once. kloq solves all of them as pure, exported, tested functions — so here they are as pages, free, with nothing to sign up for."
          aside={
            <p className="text-pretty text-sm text-muted-foreground">
              Each page runs the real export, not a copy. If a tool here gets something wrong, the
              calendar gets it wrong too — which is a good reason for us to keep them honest.
            </p>
          }
        />

        <Section>
          <Reveal>
            <SectionHead index="01" label="the tools" title="Pick one." />
          </Reveal>
          <Reveal delay={80}>
            <ToolLinks tools={TOOLS} className="mt-12 sm:grid-cols-2 lg:grid-cols-3">
              {(tool) => (
                <>
                  <p className="font-mono text-xs text-muted-foreground">{tool.detail}</p>
                  <h3 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-balance">
                    {tool.name}
                  </h3>
                  <p className="mt-2 flex-1 text-pretty text-sm text-muted-foreground">
                    {tool.lede}
                  </p>
                  <span className="mt-2 flex items-center gap-1.5 font-mono text-xs text-foreground">
                    Open it
                    <ArrowRight
                      className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </span>
                </>
              )}
            </ToolLinks>
          </Reveal>
        </Section>

        <Section>
          <Reveal>
            <SectionHead
              index="02"
              label="the calendar they came from"
              title="All five ship inside one React component."
              lede={
                <>
                  Recurrence, quick add, the zone layer and the spring sampler are all exported from
                  kloq alongside the calendar itself — <PlanCopy of="toolsLede" />.
                </>
              }
            />
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button render={<Link href="/kloq/demo" />}>Open the live demo</Button>
              <InstallCta variant="outline" />
            </div>
          </Reveal>
        </Section>
      </main>
    </div>
  );
}
