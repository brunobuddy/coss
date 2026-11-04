import { Button } from "@coss/ui/components/button";
import { Kbd } from "@coss/ui/components/kbd";
import { cn } from "@coss/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { HeroCalendarLazy } from "@/components/calendar/landing/hero-calendar-lazy";
import { installTabs } from "@/components/calendar/landing/install-data";
import { Keyboard } from "@/components/calendar/landing/keyboard";
import { MiniEvent } from "@/components/calendar/landing/mini-event";
import { QuickAddLab } from "@/components/calendar/landing/quick-add-lab";
import { Reveal } from "@/components/calendar/landing/reveal";
import { SampleCalendar } from "@/components/calendar/landing/sample-calendar";
import { Specimen } from "@/components/calendar/landing/specimen";
import { SpringLab } from "@/components/calendar/landing/spring-lab";
import { TierCards } from "@/components/calendar/landing/tier-cards";
import { CTA } from "@/components/calendar/landing/tiers";
import { Upsell } from "@/components/calendar/landing/upsell";
import { CodeTabs } from "@/components/calendar/site/code-tabs";
import { GRID_FRAGMENT_SLOT, GridFragment } from "@/components/calendar/site/grid-fragment";
import { Eyebrow, Pin } from "@/components/calendar/site/pin";
import { Mono, Row, Section, SectionHead, Sheet } from "@/components/calendar/site/section";
import { TEXT_LINK } from "@/components/calendar/site/text-link";
import { JsonLd } from "@/components/json-ld";
import { CALENDAR } from "@/lib/calendar";
import { abs, canonical, OG_IMAGE } from "@/lib/calendar/site";
import { softwareSchema, websiteSchema } from "@/lib/calendar/structured-data";

const TRY = [
  <>
    Drag an event somewhere else. The point you grabbed stays under the pointer — it never drifts.
  </>,
  <>Pull its bottom edge. The hit zone is 8 px, bigger than the pixels you can see.</>,
  <>
    Press <Kbd>Esc</Kbd> mid-drag. It springs home.
  </>,
  <>
    Press <Kbd>⌥</Kbd>
    <Kbd>D</Kbd>. The calendar annotates its own craft.
  </>,
];

const DETAILS: [string, ReactNode][] = [
  ["intent", "4 px of movement before a drag exists. A click is never a drag."],
  [
    "snap",
    <>
      15-minute steps, <Kbd>⌥</Kbd> for 5. Magnetism is eased in, not teleported.
    </>,
  ],
  ["the weld", "The point you grabbed stays under the pointer for the whole gesture."],
  ["origin ghost", "A 40 % ghost holds the old slot until you drop."],
  ["handles", "8 px resize zones straddle the block edge — bigger than the pixels you see."],
  ["auto-scroll", "Ramped at the grid edges, so the page never lurches."],
  ["promotion", "Drag a timed draft into the all-day lane and it becomes all-day mid-gesture."],
  [
    "failure",
    "The server says no → the block springs home and shakes. Sync that owns its mistakes.",
  ],
  ["escape", "Mid-drag, Esc springs it back where it came from."],
  [
    "reduced motion",
    <>
      Designed alternatives, not <code className="font-mono text-xs">animation: none</code>.
    </>,
  ],
  ["the render", "Transforms go straight to DOM nodes. React sees nothing until drop."],
  [
    "the bus",
    "Every frame publishes velocity to a zero-render pub/sub — the inspector reads it, and so can you.",
  ],
];

/* borders for a 4-cell row that is 1 column on phones, 2×2 from sm, 1×4 from lg */
const CELLS4 = [
  "sm:border-r",
  "lg:border-r",
  "sm:border-t sm:border-r lg:border-t-0",
  "sm:border-t lg:border-t-0",
];

const PERF = { count: "10,000", avg: "9.2", p50: "8.3", p95: "9.2", worst: "109", frames: "537" };

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground wrap-anywhere">
      {children}
    </code>
  );
}

function Stat({
  value,
  unit,
  label,
  className,
}: {
  value: string;
  unit?: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("px-6 py-8", className)}>
      <p className="font-heading text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl">
        {value}
        {unit && <span className="ml-1 text-2xl text-muted-foreground sm:text-3xl">{unit}</span>}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

const TITLE = CALENDAR.title;

export async function generateMetadata(): Promise<Metadata> {
  const cta = CTA;
  const description = `A React calendar with hand-tuned drag physics, a design mode and a ⌘K command palette. One component, ${cta.siteDescription}.`;
  return {
    title: { absolute: TITLE },
    description,
    alternates: canonical("/kloq"),
    openGraph: {
      images: [OG_IMAGE],
      type: "website",
      url: abs("/kloq"),
      title: TITLE,
      description,
    },
    twitter: { card: "summary_large_image", images: [OG_IMAGE], title: TITLE, description },
  };
}

export default async function Home() {
  const cta = CTA;
  const tabs = await installTabs();
  return (
    <div className="flex flex-1 flex-col">
      <JsonLd data={websiteSchema} />
      <JsonLd data={softwareSchema()} />
      <main className="flex flex-1 flex-col">
        <section className="mt-10 sm:mt-16">
          <Sheet>
            <Row>
              <Eyebrow
                className="landing-rise py-3"
                items={[
                  "v0.1.0",
                  "React 19",
                  "Tailwind v4",
                  <span key="state" className="text-foreground">
                    {cta.eyebrow}
                  </span>,
                  <Link key="link" href={cta.href} className={TEXT_LINK}>
                    {cta.link}
                  </Link>,
                ]}
              />
            </Row>

            <Row>
              <h1 className="landing-display landing-rise py-8 [animation-delay:80ms] sm:py-12">
                A calendar obsessed with micro-perfection.
              </h1>
            </Row>

            <Row
              flush
              inner="grid divide-y xl:grid-cols-[minmax(0,1fr)_26rem] xl:divide-x xl:divide-y-0"
            >
              <div className="landing-rise px-6 py-6 [animation-delay:160ms]">
                <p className="max-w-3xl text-pretty text-lg text-muted-foreground">
                  Hand-tuned drag physics, a design mode that annotates its own craft, and a command
                  palette that reaches everything. One React component — {cta.heroTail}.
                </p>
              </div>
              <div className="landing-rise flex flex-col justify-center gap-3 px-6 py-6 [animation-delay:200ms]">
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" render={<Link href={cta.heroHref} />}>
                    {cta.heroCta}
                  </Button>
                  <Button size="lg" variant="outline" render={<Link href="/kloq/demo" />}>
                    Try the live demo
                  </Button>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {cta.heroLine}{" "}
                  <Link href={cta.href} className={TEXT_LINK}>
                    {cta.link}
                  </Link>
                </p>
              </div>
            </Row>

            <Row>
              <div className="landing-rise flex flex-wrap items-center gap-x-5 gap-y-1.5 py-3 font-mono text-xs text-muted-foreground [animation-delay:280ms]">
                <span className="inline-flex items-center gap-2 text-foreground">
                  <span className="size-1.5 rounded-full bg-brand motion-safe:animate-pulse" />
                  live
                </span>
                {/* only where the calendar is wide enough to stay a seven-column week */}
                <span className="max-lg:hidden">week · 7 columns</span>
                <span>64 px / hour</span>
                <span>
                  snap 15 min · <span aria-hidden>⌥</span>
                  <span className="sr-only">option</span> 5
                </span>
                <span>intent 4 px</span>
                <span className="ml-auto">drag anything</span>
              </div>
            </Row>

            <Row flush className="landing-rise [animation-delay:320ms]">
              <div className="bg-card">
                <HeroCalendarLazy />
              </div>
            </Row>

            <Row flush>
              <ol
                aria-label="Things to try"
                className="grid divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4"
              >
                {TRY.map((t, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list; the position is the item's identity
                    key={i}
                    style={{ animationDelay: `${400 + i * 60}ms` }}
                    className={cn(
                      "landing-rise flex gap-2.5 px-6 py-4 text-sm text-muted-foreground",
                      CELLS4[i],
                    )}
                  >
                    <Pin n={i + 1} className="mt-0.5" />
                    <span className="text-pretty">{t}</span>
                  </li>
                ))}
              </ol>
            </Row>
          </Sheet>
        </section>

        <Section>
          <Reveal>
            <SectionHead
              size="lg"
              index="01"
              label="physics"
              title="Every drag has a spring."
              lede={
                <>
                  Nothing lerps. Settle, cancel and nudge run through WAAPI on a damped spring
                  sampled into a CSS <code className="font-mono text-base">linear()</code> easing.
                  The curves below are drawn from the engine&rsquo;s own{" "}
                  <code className="font-mono text-base">springSamples()</code> — play one.
                </>
              }
            />
          </Reveal>
          <Reveal delay={80} className="mt-12">
            <SpringLab />
            <Upsell className="mt-5">
              these three live in lib/springs.ts — retune them in design mode, then keep it
            </Upsell>
          </Reveal>
          <Reveal delay={120}>
            <dl className="mt-14 grid gap-x-10 border-t sm:grid-cols-2 lg:grid-cols-3">
              {DETAILS.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-4 border-b py-4">
                  <dt className="pt-0.5 font-mono text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-pretty text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </Section>

        <Section>
          <Reveal>
            <SectionHead
              size="lg"
              index="02"
              label="quick add · ⌘K"
              title="Write it in English."
              lede="One line becomes a draft. The parser reports the exact source offsets of every phrase it consumed, so the field underlines what it understood as you type. Below is the real ⌘K surface, not a mock."
            />
          </Reveal>
          <Reveal delay={80} className="mt-12">
            <QuickAddLab />
          </Reveal>
        </Section>

        <Section>
          <div className="grid gap-10 xl:grid-cols-[minmax(0,26rem)_1fr] xl:gap-16">
            <Reveal>
              <SectionHead
                size="lg"
                index="03"
                label="keyboard"
                title="Everything has a key."
                lede="About fifty bindings and one table behind them. The dispatcher and the ? sheet read the same rows, so a remapped key can never make the sheet lie."
              />
              <ul className="mt-8 flex flex-col gap-4 text-sm text-muted-foreground">
                <li className="flex gap-2.5">
                  <Pin n={1} className="mt-0.5" />
                  <span>
                    <span className="text-foreground">Scoped.</span> An embedded calendar claims no
                    key it hasn&rsquo;t earned — nothing fires until you&rsquo;ve clicked inside it,
                    and never in a text field.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Pin n={2} className="mt-0.5" />
                  <span>
                    <span className="text-foreground">Remappable.</span> Mnemonics take a{" "}
                    <Code>keymap</Code> prop. The <Kbd>⌘</Kbd> conventions and the arrows are fixed
                    on purpose.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Pin n={3} className="mt-0.5" />
                  <span>
                    <span className="text-foreground">Announced.</span> Every move, resize, colour
                    and undo is read out once, on completion — not per frame.
                  </span>
                </li>
              </ul>
              <p className="mt-8 font-mono text-xs text-muted-foreground">
                pick a modifier — or hold the real one — to see its layer
              </p>
              <Upsell className="mt-4">
                the table itself is lib/keymap.ts — add a binding, not just remap one
              </Upsell>
            </Reveal>
            <Reveal delay={80} className="min-w-0">
              <Keyboard />
            </Reveal>
          </div>
        </Section>

        {/* a dark island on the page's own dark tokens, ruled like the hero */}
        <section className="dark border-t">
          <div data-kloq-root className="bg-background text-foreground">
            <Sheet>
              <Row className="border-t-0">
                <Reveal>
                  <SectionHead
                    size="lg"
                    index="04"
                    label="scale"
                    title="Ten thousand events. Nine milliseconds a frame."
                    lede="Zero React renders during a gesture — transforms go straight to the DOM from one rAF loop — and views that stay quick when the store gets big."
                    className="py-16 sm:py-20"
                  />
                </Reveal>
              </Row>
              <Row flush inner="grid divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
                <Stat
                  value={PERF.count}
                  label="events seeded into one store"
                  className={CELLS4[0]}
                />
                <Stat
                  value={PERF.avg}
                  unit="ms"
                  label="average frame, scrolling and switching views"
                  className={CELLS4[1]}
                />
                <Stat value={PERF.p50} unit="ms" label="median frame" className={CELLS4[2]} />
                <Stat value="0" label="React renders per drag frame" className={CELLS4[3]} />
              </Row>
              <Row
                flush
                inner="grid divide-y lg:grid-cols-[minmax(0,1fr)_auto] lg:divide-x lg:divide-y-0"
              >
                <p className="max-w-3xl px-6 py-6 font-mono text-xs leading-5 text-muted-foreground tabular-nums">
                  p95 {PERF.p95} ms · worst {PERF.worst} ms · {PERF.frames} frames. The demo takes
                  the same seed, so you can watch it yourself.
                </p>
                <div className="flex min-w-0 items-center px-6 py-6">
                  <Button variant="outline" render={<Link href="/kloq/demo?events=10000" />}>
                    Open the 10,000-event demo
                  </Button>
                </div>
              </Row>
            </Sheet>
          </div>
        </section>

        <Section>
          <Reveal>
            <SectionHead
              size="lg"
              index="05"
              label="views · themes"
              title="Six views. Nineteen themes. One component."
              lede="Day, n-day, week, month, agenda and year behind one prop, with a FLIP morph between them. Nineteen themes, each in light and dark."
            />
          </Reveal>
          <Reveal delay={80} className="mt-12">
            <Specimen />
            <Upsell className="mt-5">
              a theme is one token block in styles/kloq.css — ship a twentieth with your brand
            </Upsell>
          </Reveal>
        </Section>

        <Section id="install" className="bg-muted/30">
          <Reveal>
            <SectionHead
              size="lg"
              index="06"
              label="install"
              title={cta.installTitle}
              lede={cta.installLede}
            />
          </Reveal>

          <Reveal delay={80} className="mt-12">
            <TierCards freeHref="#channels" />
          </Reveal>

          <Reveal delay={120}>
            <div
              id="channels"
              className="mt-12 grid scroll-mt-24 gap-12 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16"
            >
              <div className="min-w-0">
                <CodeTabs label="Install channel" tabs={tabs} />
              </div>
              <div className="flex min-w-0 flex-col">
                <Mono className="mb-3 flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-brand" />
                  what app/page.tsx renders — live, not a screenshot
                </Mono>
                <SampleCalendar className="lg:h-140" />
              </div>
            </div>
            <div className="mt-12 flex flex-wrap items-center gap-3">
              <Button render={<Link href="/kloq/docs/installation" />}>
                Read the install guide
              </Button>
              <Button variant="ghost" render={<Link href="/kloq/docs/registry" />}>
                About the registry
              </Button>
            </div>
          </Reveal>
        </Section>

        <Section>
          <Reveal>
            <div className="flex flex-col items-center text-center">
              <GridFragment>
                <MiniEvent
                  color="emerald"
                  title="Try kloq"
                  time="4:04 PM — 4:34 PM · accepted by you"
                  className={cn(GRID_FRAGMENT_SLOT, "h-16")}
                />
              </GridFragment>
              <h2 className="mt-10 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Put it on your calendar.
              </h2>
              <p className="mt-4 max-w-md text-pretty text-lg text-muted-foreground">{cta.outro}</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" render={<Link href={cta.heroHref} />}>
                  {cta.heroCta}
                </Button>
                <Button size="lg" variant="outline" render={<Link href="/kloq/demo" />}>
                  Try the live demo
                </Button>
                <Button size="lg" variant="ghost" render={<Link href={cta.href} />}>
                  {cta.label}
                </Button>
              </div>
            </div>
          </Reveal>
        </Section>
      </main>
    </div>
  );
}
