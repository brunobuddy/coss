import { PLANS } from "@coss/billing/catalog";
import { Button } from "@coss/ui/components/button";
import { cn } from "@coss/ui/lib/utils";
import { BookOpenTextIcon, ClipboardCopyIcon, FlaskConicalIcon } from "lucide-react";
import Link from "next/link";
import { AgentSession } from "@/components/home/agent-session";
import { CopyPromptButton } from "@/components/home/copy-prompt";
import { CustomerLogos } from "@/components/home/customer-logos";
import { AgentView, ApiView, DashboardView } from "@/components/home/investigate";
import { OneOfEach } from "@/components/home/one-of-each";
import { ProductStage, type StageTab } from "@/components/home/product-stage";
import { JsonLd } from "@/components/json-ld";
import { Play } from "@/components/marketing/demo";
import { Band, Close, FaqList, Heading, Hero, Page } from "@/components/marketing/kit";
import { ProductCard } from "@/components/marketing/product-card";
import { ProductSample } from "@/components/marketing/samples";
import { SHOWCASES } from "@/components/products";
import { SignUpButton } from "@/components/sign-up-button";
import { productBySlug } from "@/lib/marketing";
import { faqSchema, organizationSchema, pageMetadata, websiteSchema } from "@/lib/seo";
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
    <Page>
      <JsonLd data={organizationSchema()} />
      <JsonLd data={websiteSchema()} />
      <JsonLd data={faqSchema(FAQ)} />
      <HomeHero />
      <EveryProduct />
      <OneVendor />
      <Agents />
      <Investigate />
      <FaqList faq={FAQ} />
      <Close title="Send your first email before your coffee cools.">
        <p>Start free with {FREE_EMAILS} emails a month. Sandbox keys are never billed.</p>
      </Close>
    </Page>
  );
}

/** The products the hero's stage switches between, in order. */
const STAGE_PRODUCTS: readonly [slug: string, name: string][] = [
  ["email", "Email"],
  ["sms", "SMS"],
  ["scheduling", "Scheduling"],
  ["risk", "Risk"],
  ["verify", "Verify"],
  ["sign", "Sign"],
  ["inboxes", "Inboxes"],
];

/** What the short samples' calls answer: fields from the API reference's own examples. */
const STAGE_RESPONSES: Record<string, string> = {
  email: `{
  "object": "email",
  "id": "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
  "status": "queued"
}`,
  sms: `{
  "object": "sms",
  "id": "sms_01k7c8m4q2f3e9v6t5r1n0p8yz",
  "status": "queued"
}`,
};

function stageTabs(): StageTab[] {
  return STAGE_PRODUCTS.flatMap(([slug, name]) => {
    const page = productBySlug(slug);
    const showcase = SHOWCASES[slug];
    if (!page || !showcase?.stage) return [];
    return [
      {
        slug,
        name,
        code: <ProductSample body={page.data.body} />,
        stage: showcase.stage,
        response: STAGE_RESPONSES[slug],
      },
    ];
  });
}

function HomeHero() {
  return (
    <Hero
      actions={
        <>
          <SignUpButton size="lg" />
          <Button
            className="px-5"
            render={<Link href="/docs/quickstart" />}
            size="lg"
            variant="outline"
          >
            Quickstart
          </Button>
        </>
      }
      headline="The foundation the world's apps are built on."
      lede={<p>Email, SMS, inboxes, scheduling and more, behind one SDK and one API key.</p>}
    >
      <ProductStage tabs={stageTabs()} />
      <div className="mt-12 sm:mt-16">
        <CustomerLogos />
      </div>
    </Hero>
  );
}

/** Every product on the home page: size follows weight, not a uniform grid. */
const LEADING: readonly {
  slug: string;
  title: string;
  call: string;
  lede: string;
  span: string;
}[] = [
  {
    slug: "email",
    title: "Email",
    call: "coss.email",
    lede: "Transactional email from your own domains, tracked to every recipient.",
    span: "lg:col-span-7",
  },
  {
    slug: "sms",
    title: "SMS",
    call: "coss.sms",
    lede: "Text messages worldwide, on the same key, events and logs as email.",
    span: "lg:col-span-5",
  },
  {
    slug: "scheduling",
    title: "Scheduling",
    call: "coss.scheduling",
    lede: "Availability and bookings, from the team behind Cal.com.",
    span: "lg:col-span-7",
  },
  {
    slug: "risk",
    title: "Risk",
    call: "coss.risk",
    lede: "Allow, review or block sign-ups, logins and payments, with the reasons why.",
    span: "lg:col-span-5",
  },
];

const ALSO: readonly { slug: string; title: string; lede: string }[] = [
  {
    slug: "verify",
    title: "Verify",
    lede: "One-time codes by SMS or email, behind a fraud guard.",
  },
  { slug: "sign", title: "Sign", lede: "E-signatures, embedded in your app or sent by email." },
  { slug: "inboxes", title: "Inboxes", lede: "Email addresses for your AI agents." },
  { slug: "forms", title: "Forms", lede: "Form endpoints and hosted forms, screened for spam." },
  {
    slug: "hooks",
    title: "Hooks",
    lede: "Webhooks you send to your own customers, with a portal.",
  },
  {
    slug: "rate-limiting",
    title: "Rate limiting",
    lede: "A hosted rate limiter for your own endpoints.",
  },
];

function EveryProduct() {
  return (
    <Band id="products">
      <Heading
        link={{ href: "/products", label: "See every product" }}
        id="products-title"
        lede="The next one you add needs no new setup."
        title="One key, every product"
      />
      <div className="flex flex-col gap-3">
        <ul className="grid gap-3 lg:grid-cols-12">
          {LEADING.map((product) => (
            <li className={cn("min-w-0", product.span)} id={product.slug} key={product.slug}>
              <ProductCard
                call={product.call}
                href={`/products/${product.slug}`}
                lede={product.lede}
                preview
                slug={product.slug}
                title={product.title}
              />
            </li>
          ))}
        </ul>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ALSO.map((product) => (
            <li key={product.slug}>
              <ProductCard
                href={`/products/${product.slug}`}
                lede={product.lede}
                slug={product.slug}
                title={product.title}
              />
            </li>
          ))}
        </ul>
      </div>
      <p className="text-muted-foreground">
        Take a look at{" "}
        <Link className="text-foreground underline underline-offset-4" href="/solutions">
          what teams build with coss.com
        </Link>
        .
      </p>
    </Band>
  );
}

function OneVendor() {
  return (
    <Band muted>
      <Heading
        id="one-vendor-title"
        lede="Every channel you add usually means another vendor to approve, pay and search."
        link={{ href: "/compare", label: "See how coss.com compares" }}
        title="One vendor, not four"
      />
      <OneOfEach />
    </Band>
  );
}

const STEPS = [
  {
    icon: ClipboardCopyIcon,
    title: "Copy one prompt",
    body: "One line for Claude Code, Cursor or Codex.",
    action: true,
  },
  {
    icon: BookOpenTextIcon,
    title: "Your agent reads the manual",
    body: "Every docs page is Markdown at its URL plus .md.",
    action: false,
  },
  {
    icon: FlaskConicalIcon,
    title: "It tests with a sandbox key",
    body: "coss_test_ keys record every event and deliver nothing.",
    action: false,
  },
];

/** What makes the platform easy for an agent, each said in plain words and linked. */
const FOR_AGENTS: readonly [name: string, what: string, href: string][] = [
  ["/llms.txt", "An index of every docs page", "/llms.txt"],
  ["OpenAPI 3.1", "The whole API as a schema", "/docs/api-reference"],
  ["{ data, error }", "Results it can't forget to check", "/docs/sdk/errors"],
  ["Idempotency-Key", "Retries that never send twice", "/docs/api-reference/idempotency"],
];

function Agents() {
  return (
    <Band id="agents">
      <Heading
        id="agents-title"
        lede="Plain-text docs, typed results, and keys that can't send by accident."
        title="Set up in one prompt"
      />
      <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="flex min-w-0 flex-col gap-10 lg:col-span-5">
          <ol className="flex flex-col gap-6">
            {STEPS.map((step) => (
              <li className="flex items-start gap-3" key={step.title}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card shadow-xs/5">
                  <step.icon aria-hidden className="size-4 text-muted-foreground" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{step.title}</span>
                  <span className="text-muted-foreground text-sm leading-snug">{step.body}</span>
                  {step.action ? (
                    <span className="flex pt-2.5">
                      <CopyPromptButton />
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2">
            <h3 className="font-medium">What your agent gets</h3>
            <ul className="flex flex-col divide-y">
              {FOR_AGENTS.map(([name, what, href]) => (
                <li key={name}>
                  <a className="group flex items-baseline justify-between gap-4 py-2.5" href={href}>
                    <span className="text-muted-foreground text-sm">{what}</span>
                    <code className="shrink-0 font-mono text-xs group-hover:underline">{name}</code>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <figure className="min-w-0 lg:col-span-7">
          <Play>
            <AgentSession />
          </Play>
          <figcaption className="sr-only">
            A coding agent setting up coss.com from one prompt. What it does depends on your
            project.
          </figcaption>
        </figure>
      </div>
    </Band>
  );
}

/** Where a customer looks when someone asks what happened to a message: the dashboard, an agent, the API. */
function Investigate() {
  return (
    <Band muted>
      <Heading
        id="investigate-title"
        lede="Every message keeps its events. Look one up, ask your agent, or show it in your own app."
        title="Know what happened to every message"
      />
      <Play className="grid gap-4 xl:grid-cols-3">
        <DashboardView />
        <AgentView />
        <ApiView />
      </Play>
    </Band>
  );
}
