import { Button } from "@coss/ui/components/button";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PanelGrid } from "@/components/calendar/compare/ruled";
import { InstallCta } from "@/components/calendar/landing/plan-copy";
import { Reveal } from "@/components/calendar/landing/reveal";
import { PageHero } from "@/components/calendar/site/page-hero";
import { Mono, Section, SectionHead } from "@/components/calendar/site/section";
import { JsonLd } from "@/components/json-ld";
import { CALENDAR } from "@/lib/calendar";
import { CHECKED, competitors } from "@/lib/calendar/compare";
import { abs, canonical, OG_IMAGE } from "@/lib/calendar/site";
import { breadcrumbSchema, itemListSchema } from "@/lib/seo";

const TITLE = "kloq compared with FullCalendar and other React calendars";
const DESCRIPTION =
  "Three honest comparisons against the React calendars developers actually shortlist, with the rows kloq loses left in and every number sourced.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: canonical("/kloq/compare"),
  openGraph: {
    images: [OG_IMAGE],
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: abs("/kloq/compare"),
  },
  twitter: {
    card: "summary_large_image",
    images: [OG_IMAGE],
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Compare() {
  const all = competitors();
  return (
    <div className="flex flex-1 flex-col">
      <JsonLd
        data={breadcrumbSchema([
          [CALENDAR.name, CALENDAR.path],
          ["Compare", "/kloq/compare"],
        ])}
      />
      <JsonLd
        data={itemListSchema(all.map((c) => [`kloq vs ${c.name}`, `/kloq/compare/${c.slug}`]))}
      />
      <main className="flex flex-1 flex-col">
        <PageHero
          eyebrow={[
            "compare",
            "three libraries",
            <span key="checked" className="text-foreground">
              checked {CHECKED}
            </span>,
          ]}
          title="We left the losses in."
          lede={
            <>
              Every comparison page on the internet is written by one of the two products. So here
              is ours, with the same rule applied to all three: every number is read from npm or the
              other project&rsquo;s own site or repository, every page opens with the cases where
              you should install theirs instead, and kloq is version&nbsp;0.1.0 in public on each of
              them.
            </>
          }
          aside={
            <p className="text-pretty text-sm text-muted-foreground">
              If a number here has moved since {CHECKED}, the table is wrong. The sources are linked
              at the foot of every page so you can catch us at it.
            </p>
          }
        />

        <Section>
          <Reveal>
            <SectionHead
              index="01"
              label="the three"
              title="The libraries you are actually choosing between."
              lede="Picked because these are the ones a developer shortlists against an open-source React calendar — not because they are the easiest to beat."
            />
          </Reveal>
          <Reveal delay={80} className="mt-12">
            <PanelGrid className="lg:grid-cols-3">
              {all.map((c) => (
                <Link
                  key={c.slug}
                  href={`/kloq/compare/${c.slug}`}
                  className="group flex h-full flex-col gap-4 bg-card p-6 outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <Mono>
                    {c.pkg} <span className="tabular-nums">v{c.version}</span>
                  </Mono>
                  <h3 className="font-heading text-2xl font-semibold tracking-tight text-balance">
                    kloq vs {c.name}
                  </h3>
                  <p className="flex-1 text-pretty text-sm text-muted-foreground">{c.verdict}</p>
                  <p className="flex items-center gap-4 font-mono text-xs text-muted-foreground tabular-nums">
                    <span className="text-success-foreground">
                      {c.rows.filter((r) => r.win).length} we win
                    </span>
                    <span className="text-warning-foreground">
                      {c.rows.filter((r) => r.loss).length} we lose
                    </span>
                    <span>{(c.downloads / 1000).toFixed(0)}k/wk</span>
                  </p>
                  <span className="flex items-center gap-1.5 font-mono text-xs text-foreground">
                    Read it
                    <ArrowRight
                      className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </span>
                </Link>
              ))}
            </PanelGrid>
          </Reveal>
        </Section>

        <Section>
          <Reveal>
            <SectionHead
              index="02"
              label="or just try it"
              title="The fastest comparison is your own pointer."
              lede="Every calendar on this site is the real component. Drag something; press ⌥D. It takes less time than reading a table."
            />
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button size="lg" render={<Link href="/kloq/demo" />}>
                Open the live demo
              </Button>
              <InstallCta size="lg" variant="outline" />
            </div>
          </Reveal>
        </Section>
      </main>
    </div>
  );
}
