import { PLANS } from "@coss/billing/catalog";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardCopyIcon,
  FlaskConicalIcon,
  MinusIcon,
} from "lucide-react";
import Link from "next/link";
import { SampleCalendar } from "@/components/calendar/landing/sample-calendar";
import { CopyPrompt } from "@/components/home/copy-prompt";
import { AgentView, ApiView, DashboardView } from "@/components/home/investigate";
import type { Mark } from "@/components/home/iso";
import { PartDrawing } from "@/components/home/part-drawing";
import { PRODUCTS } from "@/components/home/parts";
import { PlatformAssembly } from "@/components/home/platform-assembly";
import { VendorDrawing } from "@/components/home/vendor-drawing";
import { JsonLd } from "@/components/json-ld";
import { Faq, RuledGrid } from "@/components/marketing-page";
import { CheckList, SectionHead } from "@/components/sheet";
import { ShipyardHarbour } from "@/components/shipyard/harbour";
import { ShipyardNewTask } from "@/components/shipyard/new-task";
import { SignUpButton } from "@/components/sign-up-button";
import { CALENDAR } from "@/lib/calendar";
import { faqSchema, organizationSchema, pageMetadata, websiteSchema } from "@/lib/seo";
import { SHIPYARD } from "@/lib/shipyard";
import { SITE_DESCRIPTION } from "@/lib/site";

const FREE_EMAILS = (PLANS.free.includedUnits["email.recipients"] ?? 0).toLocaleString("en-US");

export const metadata = pageMetadata({
  title: "coss.com: one API for email, SMS, AI agent inboxes and more",
  description: SITE_DESCRIPTION,
  path: "/",
});

/** Plain answers to what people ask about coss.com, on the page and in its FAQPage JSON-LD. */
const FAQ = [
  {
    question: "What is coss.com?",
    answer:
      "coss.com is a developer platform: one API key and one SDK for transactional and marketing email, inboxes for AI agents, SMS, one-time codes, forms, scheduling, webhooks for your own users, and risk checks with rate limiting. It is built by the team behind Cal.com.",
  },
  {
    question: "How much does coss.com cost?",
    answer: `You can start free with ${FREE_EMAILS} emails a month, and sandbox keys are never billed. Paid plans turn their monthly fee into credit for usage of any coss.com product.`,
  },
  {
    question: "Is coss.com open source?",
    answer:
      "Yes. The platform is open source under the AGPL, and the SDK, MCP server and CLI are MIT licensed.",
  },
  {
    question: "Which languages and frameworks does coss.com support?",
    answer:
      "There are SDKs for TypeScript, Python, Go, Ruby, PHP, Java and .NET, and drop-in integrations for Nodemailer, Better Auth, Auth.js, Laravel, Rails and Django. Apps that can't call an API can send email through the SMTP relay.",
  },
  {
    question: "Can I test without sending real messages?",
    answer:
      "Yes. Development keys (coss_test_) work with every API and record every email and SMS with their events and webhooks, and deliver nothing.",
  },
  {
    question: "Can I move to coss.com from Resend, SendGrid or Postmark?",
    answer:
      "Yes. An import brings over your domains, templates, contacts, suppressions and webhooks from any of the three.",
  },
  {
    question: "Does coss.com work with coding agents?",
    answer:
      "Yes. Every docs page is Markdown at its URL plus .md, /llms.txt indexes them, npx coss-cli init gets a development key approved in the browser, and an MCP server lets agents search the docs and explain deliveries.",
  },
];

export default function HomePage() {
  return (
    // One ruled sheet between the shell's rails (the `container` width plus the rails' 12px offset).
    <main className="mx-auto w-full max-w-[1440px] flex-1">
      <JsonLd data={organizationSchema()} />
      <JsonLd data={websiteSchema()} />
      <JsonLd data={faqSchema(FAQ)} />
      <Hero />
      <Catalog />
      <SameKey />
      <OneVendor />
      <Agents />
      <Investigate />
      <MoreFromCoss />
      <Faq faq={FAQ} />
      <Close />
    </main>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="grid grid-cols-1 border-b lg:grid-cols-12">
      <div className="flex flex-col gap-8 px-4 pt-12 pb-10 sm:px-8 sm:pt-16 lg:col-span-12 lg:grid lg:grid-cols-12 lg:items-end lg:gap-10 lg:pb-12">
        <h1
          className="text-balance font-semibold text-[clamp(2.75rem,6.5vw,5.25rem)] leading-[0.92] tracking-[-0.035em] lg:col-span-8"
          id="hero-title"
        >
          The foundation the world's apps are built on.
        </h1>
        <div className="flex flex-col gap-6 lg:col-span-4 lg:pb-2">
          <p className="max-w-md text-lg text-muted-foreground leading-snug">
            Email, SMS, inboxes, scheduling and more, behind one SDK and one API key. Give your
            coding agent one prompt and every part is wired in, so you ship the product only you can
            build.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <SignUpButton />
            <Button className="px-4" render={<Link href="/docs/quickstart" />} variant="outline">
              Quickstart
            </Button>
          </div>
        </div>
      </div>
      <div className="drafting-grid flex items-center justify-center overflow-hidden border-t px-4 py-12 lg:col-span-12">
        <PlatformAssembly className="w-full max-w-7xl text-foreground" />
      </div>
    </section>
  );
}

function Catalog() {
  return (
    <section aria-labelledby="catalog-title" className="scroll-mt-14 border-b" id="catalog">
      <SectionHead id="catalog-title" title="Catalog">
        Every product runs on the same key, the same SDK and the same platform, so the next one you
        add needs no new setup.
      </SectionHead>

      <div className="grid grid-cols-1 border-t md:grid-cols-2">
        {PRODUCTS.map((product, index) => (
          <article
            aria-labelledby={`part-${product.id}`}
            className="flex scroll-mt-20 flex-col border-b md:odd:border-r md:[&:nth-last-child(-n+2)]:border-b-0"
            id={product.id}
            key={product.id}
          >
            <div className="drafting-grid relative flex h-56 items-center justify-center border-b">
              <PartDrawing call={product.call} className="w-44" part={product.id} />
              <span className="absolute top-4 left-4 font-mono text-muted-foreground text-xs sm:left-8">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-4 px-4 py-8 sm:px-8">
              <div className="flex flex-wrap items-baseline gap-3">
                <h3 className="font-semibold text-3xl tracking-[-0.02em]" id={`part-${product.id}`}>
                  {product.name}
                </h3>
                <code className="font-mono text-muted-foreground text-sm">{product.call}</code>
              </div>
              <p className="max-w-md text-lg leading-snug">{product.summary}</p>
              <CheckList items={product.features} />
              {product.href ? (
                <Link
                  className="mt-auto inline-flex items-center gap-1.5 pt-2 font-medium text-sm hover:underline"
                  href={product.href}
                >
                  About {product.name}
                  <ArrowRightIcon aria-hidden className="size-3.5" />
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** The products beyond the catalog's parts, each on its own page. */
const SAME_KEY: { mark: Mark; call: string; name: string; summary: string; href: string }[] = [
  {
    mark: "sign",
    call: "coss.sign",
    name: "Sign",
    summary: "E-signatures, embedded in your app or sent by email.",
    href: "/products/sign",
  },
  {
    mark: "verify",
    call: "coss.verify",
    name: "Verify",
    summary: "One-time codes by SMS or email, behind a fraud guard.",
    href: "/products/verify",
  },
  {
    mark: "forms",
    call: "coss.forms",
    name: "Forms",
    summary: "Form endpoints and hosted forms, screened for spam.",
    href: "/products/forms",
  },
  {
    mark: "hooks",
    call: "coss.hooks",
    name: "Hooks",
    summary: "Webhooks you send to your own customers, with a portal.",
    href: "/products/hooks",
  },
  {
    mark: "risk",
    call: "coss.risk",
    name: "Risk",
    summary: "Allow, review or block sign-ups, logins and payments.",
    href: "/products/risk",
  },
  {
    mark: "limits",
    call: "coss.risk.limit",
    name: "Rate limiting",
    summary: "A hosted rate limiter for your own endpoints.",
    href: "/products/rate-limiting",
  },
];

/** Everything else on the same key: the products without a catalog part, linked to their pages. */
function SameKey() {
  return (
    <section aria-labelledby="same-key-title" className="border-b">
      <SectionHead id="same-key-title" title="Also on the same key">
        Signatures, one-time codes, forms, webhooks for your own users, risk decisions and rate
        limits: the same key, SDK, events and logs. <Link href="/products">Every product</Link>, and{" "}
        <Link href="/solutions">what teams build with them</Link>.
      </SectionHead>
      <RuledGrid>
        {SAME_KEY.map((product) => (
          <li key={product.href}>
            <Link
              className="group flex h-full items-center gap-5 px-4 py-6 sm:px-8"
              href={product.href}
            >
              <PartDrawing call={product.call} className="w-24 shrink-0" part={product.mark} />
              <span className="flex flex-col gap-1">
                <span className="font-semibold text-xl tracking-[-0.01em] group-hover:underline">
                  {product.name}
                </span>
                <span className="text-muted-foreground text-sm leading-snug">
                  {product.summary}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </RuledGrid>
    </section>
  );
}

const COMPARISON: [string, string][] = [
  ["Four accounts and four sets of keys", "One account, one key per environment"],
  ["Four SDKs to learn and keep updated", "One SDK for every product"],
  ["Four webhook formats to verify", "One webhook format and signature"],
  ["Four dashboards to search when something breaks", "One log across every product"],
  ["Four invoices", "One bill"],
  ["Start over for every new channel", "The next product is already set up"],
];

/** Why one platform matters to a customer: the same four channels, from four vendors or from one. */
function OneVendor() {
  return (
    <section aria-labelledby="one-vendor-title" className="border-b">
      <SectionHead id="one-vendor-title" title="One vendor, not four">
        Every channel you add usually means another account, another SDK, another dashboard and
        another invoice. With coss.com, the next one is already set up.{" "}
        <Link href="/compare">See how coss.com compares</Link>.
      </SectionHead>
      <div className="grid grid-cols-1 border-t md:grid-cols-2">
        {(["apart", "together"] as const).map((side) => {
          const together = side === "together";
          return (
            <div
              className={
                together ? "flex flex-col" : "flex flex-col border-b md:border-r md:border-b-0"
              }
              key={side}
            >
              <div className="flex items-baseline justify-between gap-4 border-b px-4 py-5 sm:px-8">
                <h3
                  className={
                    together
                      ? "font-semibold text-2xl tracking-[-0.02em]"
                      : "font-semibold text-2xl text-muted-foreground tracking-[-0.02em]"
                  }
                >
                  {together ? "With coss.com" : "Four vendors"}
                </h3>
                <span className="font-mono text-muted-foreground text-xs">
                  {together ? "1 integration" : "4 integrations"}
                </span>
              </div>
              <div className="drafting-grid flex items-center justify-center border-b px-6 py-8">
                <VendorDrawing
                  className={
                    together
                      ? "w-full max-w-md text-foreground"
                      : "w-full max-w-md text-muted-foreground"
                  }
                  together={together}
                />
              </div>
              <ul className="flex flex-col px-4 py-4 sm:px-8">
                {COMPARISON.map(([apart, joined]) => (
                  <li
                    className="flex items-center gap-3 border-b py-3.5 last:border-b-0"
                    key={apart}
                  >
                    {together ? (
                      <CheckIcon aria-hidden className="size-4 shrink-0" />
                    ) : (
                      <MinusIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={together ? undefined : "text-muted-foreground"}>
                      {together ? joined : apart}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const STEPS = [
  {
    icon: ClipboardCopyIcon,
    title: "Copy one prompt",
    body: "One line for Claude Code, Cursor or Codex. It points your agent at the manual and at a key you approve.",
  },
  {
    icon: BookOpenTextIcon,
    title: "Your agent reads the manual",
    body: "/llms.txt indexes every docs page, each one Markdown at its URL plus .md, the API reference with every field.",
  },
  {
    icon: FlaskConicalIcon,
    title: "It tests with a sandbox key",
    body: "coss_test_ keys record every email and event and deliver nothing, so the agent can run its code for real.",
  },
];

const INTERFACES: [string, string, string | null][] = [
  ["/llms.txt", "How to start, and every docs page as Markdown.", "/llms.txt"],
  ["/llms-full.txt", "The whole manual in one file.", "/llms-full.txt"],
  [
    "OpenAPI 3.1",
    "The source of the API reference, its samples and playground.",
    "/docs/api-reference",
  ],
  [
    "{ data, error }",
    "No thrown API errors: every failure is a value with a type and a code.",
    "/docs/sdk/errors",
  ],
  [
    "Idempotency-Key",
    "Sent with every POST and reused across retries, so a retried send never sends twice.",
    "/docs/api-reference/idempotency",
  ],
  [
    "Coss-Version",
    "Dated versions: what works today keeps working until you upgrade.",
    "/docs/api-reference/versioning",
  ],
];

const SESSION: { kind: "you" | "tool" | "out" | "done"; text: string }[] = [
  {
    kind: "you",
    text: "Add coss.com to this project: read https://coss.com/llms.txt, get a development key…",
  },
  { kind: "tool", text: "Fetch  coss.com/llms.txt" },
  { kind: "tool", text: "Bash   npx coss-cli init" },
  { kind: "out", text: "✔ Saved a development key to .env.local as COSS_API_KEY." },
  { kind: "tool", text: "Fetch  coss.com/docs/email/sending.md" },
  { kind: "tool", text: "Fetch  coss.com/docs/sdk/webhooks.md" },
  { kind: "tool", text: "Write  src/lib/coss.ts" },
  { kind: "tool", text: "Write  src/app/api/webhooks/coss/route.ts" },
  { kind: "tool", text: "Bash   npx tsx scripts/send-test.ts" },
  { kind: "out", text: "email_01k7c8m4q2f3e9v6t5r1n0p8yz  queued" },
  {
    kind: "done",
    text: "Email and signed delivery webhooks are in. The test send was recorded with your sandbox key; nothing was delivered.",
  },
];

function Agents() {
  return (
    <section aria-labelledby="agents-title" className="scroll-mt-14 border-b" id="agents">
      <SectionHead id="agents-title" title="Assembly takes one prompt">
        coss.com is written for the agent doing the work as much as for you: plain-text docs, typed
        results, and keys that can't send by accident.
      </SectionHead>

      <div className="border-t px-4 py-8 sm:px-8">
        <CopyPrompt />
      </div>

      <ol className="grid border-t md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            className="flex flex-col gap-3 border-b px-4 py-8 last:border-b-0 sm:px-8 md:border-r md:border-b-0 md:last:border-r-0"
            key={step.title}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-7 items-center justify-center rounded-full border font-mono text-xs">
                {index + 1}
              </span>
              <step.icon aria-hidden className="size-4.5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-xl tracking-[-0.01em]">{step.title}</h3>
            <p className="text-muted-foreground leading-snug">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 border-t lg:grid-cols-12">
        <figure className="flex min-w-0 flex-col gap-3 border-b px-4 py-10 sm:px-8 lg:col-span-7 lg:border-r lg:border-b-0">
          <div className="overflow-hidden rounded-xl border bg-background">
            <div className="flex items-center gap-1.5 border-b px-3.5 py-2.5">
              <span className="size-2.5 rounded-full border" />
              <span className="size-2.5 rounded-full border" />
              <span className="size-2.5 rounded-full border" />
              <span className="ml-2 font-mono text-muted-foreground text-xs">agent session</span>
            </div>
            <ol className="flex flex-col gap-1.5 overflow-x-auto px-4 py-4 font-mono text-[0.8125rem] leading-relaxed">
              {SESSION.map((line) => (
                <li
                  className={
                    line.kind === "you"
                      ? "mb-2 text-foreground"
                      : line.kind === "tool"
                        ? "whitespace-pre text-muted-foreground"
                        : line.kind === "out"
                          ? "whitespace-pre pl-4 text-muted-foreground/80"
                          : "mt-2 text-foreground"
                  }
                  key={line.text}
                >
                  <span
                    aria-hidden
                    className="mr-2 inline-flex w-3.5 translate-y-0.5 text-foreground"
                  >
                    {line.kind === "you" || line.kind === "tool" ? (
                      <ChevronRightIcon
                        className={line.kind === "tool" ? "size-3.5 opacity-40" : "size-3.5"}
                      />
                    ) : line.kind === "done" ? (
                      <CheckIcon className="size-3.5" />
                    ) : null}
                  </span>
                  {line.text}
                </li>
              ))}
            </ol>
          </div>
          <figcaption className="text-muted-foreground text-sm">
            An illustrative session. What your agent does depends on your project.
          </figcaption>
        </figure>
        <div className="px-4 py-10 sm:px-8 lg:col-span-5">
          <h3 className="font-semibold text-2xl tracking-[-0.02em]">Interfaces for agents</h3>
          <ul className="mt-6 flex flex-col">
            {INTERFACES.map(([name, description, href]) => (
              <li className="border-t py-3.5 last:border-b" key={name}>
                {href ? (
                  <Link className="group flex flex-col gap-1" href={href}>
                    <code className="font-mono text-sm group-hover:underline">{name}</code>
                    <span className="text-muted-foreground text-sm">{description}</span>
                  </Link>
                ) : (
                  <span className="flex flex-col gap-1">
                    <code className="font-mono text-sm">{name}</code>
                    <span className="text-muted-foreground text-sm">{description}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Where a customer looks when someone asks what happened to a message: the dashboard, an agent, the API. */
function Investigate() {
  return (
    <section aria-labelledby="investigate-title" className="border-b">
      <SectionHead id="investigate-title" title="Know what happened to every message">
        Every message keeps its events. Look one up in the dashboard, ask your agent, or show it in
        your own admin panel.
      </SectionHead>
      <div className="grid grid-cols-1 border-t lg:grid-cols-12">
        <div className="drafting-grid flex min-w-0 flex-col gap-4 border-b px-4 py-6 sm:px-8 lg:col-span-7 lg:border-r lg:border-b-0">
          <div className="flex flex-col gap-1">
            <h3 className={CARD_TITLE}>Look it up in the dashboard</h3>
            <p className="text-muted-foreground text-sm leading-snug">
              Search by address and see every event, from sent to opened.
            </p>
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <DashboardView />
          </div>
        </div>
        <div className="flex min-w-0 flex-col lg:col-span-5">
          <div className="flex flex-1 flex-col gap-4 border-b px-4 py-6 sm:px-8">
            <h3 className={CARD_TITLE}>Ask your agent with the MCP server</h3>
            <AgentView />
          </div>
          <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
            <h3 className={CARD_TITLE}>Show it in your admin panel with the API</h3>
            <ApiView />
          </div>
        </div>
      </div>
    </section>
  );
}

const CARD_TITLE = "font-semibold text-lg tracking-[-0.01em]";

/** coss.com's other products: Shipyard and kloq, each with its own pages. */
function MoreFromCoss() {
  return (
    <section aria-labelledby="more-title" className="border-b">
      <SectionHead id="more-title" title="Also from coss.com">
        More from the team behind coss.com, each with its own pages here.
      </SectionHead>
      <div className="grid grid-cols-1 border-t lg:grid-cols-2">
        <article
          aria-labelledby="more-shipyard"
          className="flex min-w-0 flex-col border-b lg:border-r lg:border-b-0"
        >
          {/* The harbour with the app's New task box over it, as the ⌘N moment on its own page. */}
          <div className="relative h-64 overflow-hidden border-b sm:h-80">
            <ShipyardHarbour className="h-full" />
            <ShipyardNewTask className="absolute top-[14%] left-1/2 -translate-x-1/2 [mask-image:linear-gradient(black_72%,transparent)]" />
          </div>
          <div className="flex flex-col items-start gap-4 px-4 py-8 sm:px-8">
            <h3
              className="flex items-center gap-2.5 font-semibold text-2xl tracking-tight"
              id="more-shipyard"
            >
              {SHIPYARD.name}
              <Badge variant="outline">New</Badge>
            </h3>
            <p className="max-w-lg text-muted-foreground">{SHIPYARD.description}</p>
            <div className="flex flex-wrap gap-2.5">
              <Button render={<Link href={SHIPYARD.path} />} variant="outline">
                About Shipyard
              </Button>
              <Button render={<Link href={SHIPYARD.docs} />} variant="ghost">
                Docs
              </Button>
            </div>
          </div>
        </article>
        <article aria-labelledby="more-kloq" className="flex min-w-0 flex-col">
          <div className="h-56 overflow-hidden border-b p-4 sm:h-72">
            <SampleCalendar className="h-full" />
          </div>
          <div className="flex flex-col items-start gap-4 px-4 py-8 sm:px-8">
            <h3
              className="flex items-center gap-2.5 font-semibold text-2xl tracking-tight"
              id="more-kloq"
            >
              {CALENDAR.name}
              <Badge variant="outline">New</Badge>
            </h3>
            <p className="max-w-lg text-muted-foreground">{CALENDAR.description}</p>
            <div className="flex flex-wrap gap-2.5">
              <Button render={<Link href={CALENDAR.path} />} variant="outline">
                About kloq
              </Button>
              <Button render={<Link href={CALENDAR.demo} />} variant="ghost">
                Live demo
              </Button>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function Close() {
  return (
    <section aria-labelledby="close-title" className="drafting-grid px-4 py-20 sm:px-8 sm:py-28">
      <div className="flex flex-col items-start gap-8">
        <h2
          className="max-w-4xl text-balance font-semibold text-[clamp(2.5rem,6vw,4.75rem)] leading-[0.95] tracking-[-0.035em]"
          id="close-title"
        >
          Fit your first part before your coffee cools.
        </h2>
        <p className="max-w-xl text-lg text-muted-foreground">
          Start free with {FREE_EMAILS} emails a month. Sandbox keys are never billed.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <SignUpButton size="lg" />
          <Button className="px-5" render={<Link href="/docs" />} size="lg" variant="outline">
            Read the docs
          </Button>
          <Button className="px-5" render={<Link href="/pricing" />} size="lg" variant="ghost">
            Pricing
          </Button>
        </div>
      </div>
    </section>
  );
}
