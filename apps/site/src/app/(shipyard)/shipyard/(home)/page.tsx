import { Button } from "@coss/ui/components/button";
import { ArrowRightIcon, DownloadIcon, PlayIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/json-ld";
import { CopyLine } from "@/components/shipyard/copy-line";
import {
  FleetDrawing,
  LoopDrawing,
  NightDrawing,
  PageDrawing,
  PhoneDrawing,
  ReviewDrawing,
  StartDrawing,
  WatchDrawing,
} from "@/components/shipyard/drawings";
import { Stage } from "@/components/shipyard/stage";
import { freeSoftwareSchema, pageMetadata } from "@/lib/seo";
import { SHIPYARD } from "@/lib/shipyard";

export const metadata: Metadata = pageMetadata({
  title: SHIPYARD.title,
  description: SHIPYARD.description,
  path: SHIPYARD.path,
  image: SHIPYARD.image,
});

const links = SHIPYARD.links;
const guide = (name: string) => `${SHIPYARD.docs}/guides/${name}`;

// Shipyard's landing page, drawn like the coss.com catalog: one ruled sheet between the shell's
// rails, each section closing with a hairline. The drawings are components/shipyard/drawings.tsx;
// each sits in a Stage, which drops its parts in when it scrolls into view. landing.css styles the
// drawings and their motion.
export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1">
      <JsonLd
        data={freeSoftwareSchema({
          name: SHIPYARD.name,
          description: SHIPYARD.description,
          path: SHIPYARD.path,
          operatingSystem: "macOS",
          repository: SHIPYARD.github,
        })}
      />
      <Hero />
      <WorksWith />
      <Features />
      <KeepsGoing />
      <Yard />
      <Install />
    </main>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="border-b">
      <div className="flex flex-col gap-8 px-4 pt-12 pb-10 sm:px-8 sm:pt-16 lg:grid lg:grid-cols-12 lg:items-end lg:gap-10 lg:pb-12">
        <h1
          className="text-balance font-semibold text-[clamp(2.75rem,6.5vw,5.25rem)] leading-[0.92] tracking-[-0.035em] lg:col-span-8"
          id="hero-title"
        >
          Agents that keep working when your laptop sleeps.
        </h1>
        <div className="flex flex-col gap-6 lg:col-span-4 lg:pb-2">
          <p className="max-w-md text-lg text-muted-foreground leading-snug">
            Shipyard runs Claude Code, Codex and other coding agents on your own machines, each in a
            worktree with its own terminals and dev server. Close the laptop, and they keep going.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button className="px-4" render={<a href={links.macDmg} />}>
              <DownloadIcon />
              Download for macOS
            </Button>
            <Button className="px-4" render={<a href={links.demo} />} variant="outline">
              <PlayIcon />
              Try the live demo
            </Button>
          </div>
          <div className="flex flex-col gap-1 text-muted-foreground text-sm">
            <p>Apple silicon and Intel, signed and notarized. Free and open source.</p>
            <p>
              Linux (alpha):{" "}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href={links.linuxAppImage}
              >
                AppImage
              </a>{" "}
              ·{" "}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href={links.linuxDeb}
              >
                .deb
              </a>
              , x86-64.
            </p>
          </div>
        </div>
      </div>
      <Stage className="drafting-grid flex items-center justify-center overflow-hidden border-t px-4 py-10 sm:py-12">
        <FleetDrawing className="w-full max-w-7xl" />
      </Stage>
    </section>
  );
}

const AGENTS = ["Claude Code", "Codex", "Cursor", "Gemini CLI", "OpenCode", "oh-my-pi"];

function WorksWith() {
  return (
    <section
      aria-label="Works with"
      className="flex flex-col gap-4 border-b px-4 py-6 sm:px-8 lg:flex-row lg:items-center lg:gap-10"
    >
      <span className="w-28 shrink-0 font-mono text-muted-foreground text-xs">works with</span>
      <ul className="flex flex-1 flex-wrap gap-x-8 gap-y-2 font-medium text-foreground/80 text-lg lg:justify-between">
        {AGENTS.map((agent) => (
          <li key={agent}>{agent}</li>
        ))}
      </ul>
    </section>
  );
}

function SectionHead({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-b px-4 pt-16 pb-10 sm:px-8 sm:pt-24 lg:grid-cols-12 lg:gap-10">
      <h2
        className="text-balance font-semibold text-4xl tracking-[-0.03em] sm:text-5xl lg:col-span-6"
        id={id}
      >
        {title}
      </h2>
      <div className="max-w-xl text-lg text-muted-foreground leading-snug lg:col-span-5 lg:col-start-8 lg:pt-2">
        {children}
      </div>
    </div>
  );
}

const FEATURES: { title: string; tags: string; summary: string; drawing: ReactNode }[] = [
  {
    title: "Start",
    tags: "⌘N · Linear · templates",
    summary:
      "Describe the task, or pick a Linear issue. Choose a project, a box and an agent, and it starts in a fresh worktree.",
    drawing: <StartDrawing />,
  },
  {
    title: "Watch it work",
    tags: "steps · diffs · questions · artifacts",
    summary:
      "Commands fold into one line, edits land as diffs, and the charts and tables it makes sit beside the chat. When it asks, answer right there.",
    drawing: <WatchDrawing />,
  },
  {
    title: "See the page",
    tags: "browser · preview · visual diffs",
    summary:
      "Each worktree's dev server has its own address. Open it in a tab, at phone, tablet and desktop sizes at once, and let the agent diff its pages before it says it's done.",
    drawing: <PageDrawing />,
  },
  {
    title: "Loop until green",
    tags: "loops · reviews · attempts",
    summary:
      "Loop an agent until the tests pass, have a second one review it, or try three ways and compare. The box runs it and keeps a journal, so it carries on while you sleep.",
    drawing: <LoopDrawing />,
  },
  {
    title: "Review",
    tags: "inbox · PR links",
    summary:
      "Finished work waits in one inbox with its diff, its page and its PR. A teammate's pull request opens on your own box in one click, set up like your worktrees are.",
    drawing: <ReviewDrawing />,
  },
  {
    title: "From your phone",
    tags: "tailnet · ntfy",
    summary:
      "See which agents need you across every box, and answer them from your phone. Each box serves the phone app over your tailnet; ntfy pings you when one asks.",
    drawing: <PhoneDrawing />,
  },
];

function Features() {
  return (
    <section aria-labelledby="features-title" className="scroll-mt-14 border-b" id="features">
      <SectionHead id="features-title" title="From one line to a merged PR.">
        Every task gets a worktree on the box you pick, set up from your kit with its ports, env and
        database, and the agent of your choice in it. You watch, steer and review from one app.
      </SectionHead>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {FEATURES.map((feature, index) => (
          <article
            aria-labelledby={`feature-${index}`}
            className="flex flex-col border-b last:border-b-0 md:odd:border-r md:[&:nth-last-child(-n+2)]:border-b-0"
            key={feature.title}
          >
            <Stage className="drafting-grid relative flex items-center justify-center overflow-hidden border-b">
              <span className="absolute top-4 left-4 font-mono text-muted-foreground text-xs sm:left-8">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="w-full max-w-[720px]">{feature.drawing}</div>
            </Stage>
            <div className="flex flex-1 flex-col gap-4 px-4 py-8 sm:px-8">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-semibold text-3xl tracking-[-0.02em]" id={`feature-${index}`}>
                  {feature.title}
                </h3>
                <span className="font-mono text-muted-foreground text-sm">{feature.tags}</span>
              </div>
              <p className="max-w-lg text-lg leading-snug">{feature.summary}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const NIGHT = [
  ["23:41", "laptop", "", "lid closed"],
  ["23:52", "devl", "checkout-fix", "tests green, 48 passed"],
  ["01:17", "gpu", "judge-v2", "eval run 3 of 3 done"],
  ["03:05", "devl", "order-export", "loop: green after 4 rounds"],
  ["06:30", "devl", "qa-deck", "asks: ship to staging?"],
  ["08:15", "laptop", "", "lid open · 1 needs you, 3 in Review"],
] as const;

function KeepsGoing() {
  return (
    <section aria-labelledby="night-title" className="border-b" id="keeps-going">
      <SectionHead id="night-title" title="Close the laptop. It keeps going.">
        Agents, loops and flows run on your boxes, not on your Mac. Shut the lid and catch the
        train. When you open it again, Review has what finished and Home has what needs you.
      </SectionHead>
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col justify-center gap-3 border-b px-4 py-10 sm:px-8 lg:border-r lg:border-b-0">
          <div className="overflow-hidden rounded-xl border bg-background">
            <div className="flex items-center justify-between gap-4 border-b px-4 py-2.5 font-mono text-muted-foreground text-xs">
              <span>while you were away · 23:40 → 08:15</span>
              <span>2 boxes</span>
            </div>
            <ol className="flex flex-col gap-1.5 overflow-x-auto px-4 py-3.5 font-mono text-[0.8125rem]">
              {NIGHT.map(([time, box, task, what]) => (
                <li
                  className="grid min-w-max grid-cols-[3.5rem_4.5rem_8.5rem_1fr] gap-2"
                  key={time}
                >
                  <span className="text-muted-foreground">{time}</span>
                  <span>{box}</span>
                  <span className="text-muted-foreground">{task}</span>
                  <span className={what.startsWith("asks") ? "sy-asks" : undefined}>{what}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-muted-foreground text-sm">
            An illustrative night. Your agents do what your tasks ask.
          </p>
        </div>
        <Stage className="drafting-grid flex items-center justify-center overflow-hidden px-4 py-6">
          <NightDrawing />
        </Stage>
      </div>
    </section>
  );
}

const YARD: { name: string; tag: string; summary: string; href?: string }[] = [
  {
    name: "Automations",
    tag: "flows",
    summary:
      "When a PR opens or a check fails, run steps on the box. On events, on a schedule or on GitHub activity.",
    href: guide("automations"),
  },
  {
    name: "Kits",
    tag: "team setup",
    summary:
      "Set a project up the same way on every box, and hand a new teammate the whole setup as one link.",
    href: guide("kits"),
  },
  {
    name: "Database",
    tag: "postgres",
    summary:
      "Each worktree's own dev database as a tab. Browse tables, edit rows, run SQL, read-only until you unlock it.",
  },
  {
    name: "Leadline",
    tag: "traces",
    summary:
      "What your code did in development: queries and their N+1s, request traces and logs, kept on the box.",
    href: guide("leadline"),
  },
  {
    name: "Linear",
    tag: "issues",
    summary:
      "Your issues inside Shipyard, and an agent on any of them in one step. The API key stays on your computer.",
    href: guide("linear"),
  },
  {
    name: "Secrets",
    tag: "env",
    summary:
      "Name a secret in a project's environment instead of pasting it, and each box reads it when it's needed.",
    href: guide("secrets"),
  },
  {
    name: "Plugins",
    tag: "react sdk",
    summary:
      "Add screens, worktree panels, commands and status items. Git, PRs and box monitoring ship as plugins.",
    href: guide("plugins"),
  },
  {
    name: "Themes",
    tag: "23 built in",
    summary:
      "Dracula to Solarized, for the app and its terminals. Or write your own as a JSON file.",
    href: guide("themes"),
  },
];

function Yard() {
  return (
    <section aria-labelledby="yard-title" className="border-b">
      <SectionHead id="yard-title" title="The rest of the yard.">
        Set a project up the same on every box, automate what happens around your agents, and build
        on it. Every piece is in the docs.
      </SectionHead>
      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {YARD.map((item) => {
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium text-lg">{item.name}</span>
                <span className="font-mono text-muted-foreground text-xs">{item.tag}</span>
              </div>
              <p className="text-muted-foreground leading-snug">{item.summary}</p>
            </>
          );
          return (
            <li className="sy-yard border-b" key={item.name}>
              {item.href ? (
                <Link
                  className="flex h-full flex-col gap-2.5 px-4 py-7 transition-colors hover:bg-muted/40 sm:px-8"
                  href={item.href}
                >
                  {body}
                </Link>
              ) : (
                <div className="flex h-full flex-col gap-2.5 px-4 py-7 sm:px-8">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "Get the app",
    body: (
      <>
        <p>Signed and notarized for Apple silicon and Intel. Linux builds are in alpha.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button className="px-4" render={<a href={links.macDmg} />}>
            <DownloadIcon />
            Download for macOS
          </Button>
          <Button className="px-4" render={<a href={links.linuxAppImage} />} variant="outline">
            Linux
          </Button>
        </div>
      </>
    ),
  },
  {
    title: "Add a box",
    body: (
      <p>
        Any Mac or Linux machine you can SSH to: a desktop under your desk, a cloud VM, a GPU box.
        Run the line above as the user your agents run as.
      </p>
    ),
  },
  {
    title: "Press ⌘N",
    body: (
      <p>Say what you want. Your first agent starts in its own worktree before the kettle boils.</p>
    ),
  },
];

const ENDS = [
  { label: "Read the docs", href: SHIPYARD.docsInstall },
  { label: "Changelog", href: SHIPYARD.changelog },
  { label: "GitHub", href: SHIPYARD.github },
  { label: "Try the live demo", href: links.demo },
];

function Install() {
  return (
    <section aria-labelledby="install-title" className="scroll-mt-14" id="install-now">
      <SectionHead id="install-title" title="Your agents, docked.">
        The Mac app, and berthd on each box: one line, no root. Paste the link it prints into Add a
        box. Free and open source.
      </SectionHead>
      <div className="border-b bg-background">
        <CopyLine command={`curl -fsSL ${links.install} | sh`} label="on each box" />
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            className="flex flex-col gap-3 border-b px-4 py-8 text-muted-foreground leading-snug sm:px-8 md:border-r md:border-b-0 md:last:border-r-0"
            key={step.title}
          >
            <span className="flex size-6 items-center justify-center rounded-full border font-mono text-foreground text-xs">
              {index + 1}
            </span>
            <span className="font-medium text-foreground text-lg">{step.title}</span>
            {step.body}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t px-4 py-6 text-sm sm:px-8">
        {ENDS.map((item) => {
          const Anchor = item.href.startsWith("/") ? Link : "a";
          return (
            <Anchor
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              href={item.href}
              key={item.label}
            >
              {item.label}
              <ArrowRightIcon className="size-3.5" />
            </Anchor>
          );
        })}
      </div>
    </section>
  );
}
