import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@coss/ui/components/accordion";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@coss/ui/components/breadcrumb";
import { Button } from "@coss/ui/components/button";
import { Card, CardFrame } from "@coss/ui/components/card";
import { cn } from "@coss/ui/lib/utils";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CopyPrompt } from "@/components/home/copy-prompt";
import { Play } from "@/components/marketing/demo";
import { SignUpButton } from "@/components/sign-up-button";
import { ProductTile } from "./product-tile";

export { Facts } from "./facts";
export { ProductTile };

/*
 * The marketing pages' parts (DESIGN.md): the dashboard's vocabulary at marketing scale. A centred
 * hero over a working stage, sections separated by space rather than rules, muted trays holding
 * raised cards, and the product's interface in place of paragraphs.
 */

/** The page's main column. */
export function Page({ children }: { children: ReactNode }) {
  return <main className="w-full flex-1">{children}</main>;
}

/** The content width: everything on a marketing page lines up on it. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1416px] px-4 sm:px-6", className)}>{children}</div>
  );
}

/** A section of a page: one idea, one rhythm. `muted` sets a run of sections apart. */
export function Band({
  id,
  muted,
  className,
  children,
}: {
  id?: string;
  muted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("scroll-mt-20 py-16 sm:py-24", muted && "bg-muted/80", className)}
      id={id}
    >
      <Container className="flex flex-col gap-10 sm:gap-14">{children}</Container>
    </section>
  );
}

/**
 * A section's head: the heading, with its sentence below it and any link onward at the end of that
 * sentence. No eyebrows, ever.
 */
export function Heading({
  id,
  title,
  lede,
  link,
}: {
  id?: string;
  title: ReactNode;
  lede?: ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <h2
        className="text-balance font-heading font-semibold text-3xl tracking-[-0.01em] sm:text-[2.5rem] sm:leading-[1.1]"
        id={id}
      >
        {title}
      </h2>
      {lede || link ? (
        <p className="max-w-2xl text-pretty text-lg text-muted-foreground leading-snug">
          {lede}
          {link ? (
            <>
              {" "}
              <Link className="text-foreground underline underline-offset-4" href={link.href}>
                {link.label}
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** A small breadcrumb trail at the top of a page: real navigation, not a label. */
export function Crumbs({ trail }: { trail: readonly (readonly [string, string?])[] }) {
  return (
    <Container className="pt-6">
      <Breadcrumb>
        <BreadcrumbList>
          {trail.map(([label, href], index) => (
            <span className="contents" key={label}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {href ? (
                  <BreadcrumbLink render={<Link href={href} />}>{label}</BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </span>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </Container>
  );
}

/** The hero: a large headline on the left, its sentence and actions on the right, then the stage. */
export function Hero({
  tile,
  headline,
  lede,
  actions,
  children,
}: {
  tile?: ReactNode;
  headline: ReactNode;
  lede: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="hero-title" className="overflow-x-clip pt-10 sm:pt-14">
      <Container className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-end lg:gap-10">
        <div className="flex flex-col items-start gap-5 lg:col-span-8">
          {tile}
          <h1
            className="text-balance font-heading font-semibold text-[clamp(2.5rem,5.5vw,4.5rem)] leading-[1] tracking-[-0.02em]"
            id="hero-title"
          >
            {headline}
          </h1>
        </div>
        <div className="flex flex-col gap-5 lg:col-span-4 lg:pb-1.5">
          <div className="text-pretty text-lg text-muted-foreground leading-snug">{lede}</div>
          {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
        </div>
      </Container>
      {children ? <Container className="mt-10 sm:mt-12">{children}</Container> : null}
    </section>
  );
}

/** The usual hero actions: sign up, then the guide. */
export function HeroActions({
  docs,
  docsLabel = "Read the docs",
}: {
  docs: string;
  docsLabel?: string;
}) {
  return (
    <>
      <SignUpButton size="lg" />
      <Button className="px-5" render={<Link href={docs} />} size="lg" variant="outline">
        {docsLabel}
      </Button>
    </>
  );
}

/**
 * A tray holding a raised card: the dashboard's panel, the frame around every piece of product on
 * these pages. The header sits on the tray; `flush` lets a table or code run edge to edge.
 */
export function Tray({
  title,
  meta,
  action,
  flush,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const header = title || meta || action;
  return (
    <CardFrame className={cn("w-full min-w-0", className)}>
      {header ? (
        <div className="relative flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="min-w-0 truncate font-medium text-sm">{title}</span>
          <span className="flex shrink-0 items-center gap-2">
            {meta ? <span className="text-muted-foreground text-xs">{meta}</span> : null}
            {action}
          </span>
        </div>
      ) : null}
      <Card className={cn("min-w-0 flex-1 overflow-hidden", !flush && "p-4 sm:p-5", bodyClassName)}>
        {children}
      </Card>
    </CardFrame>
  );
}

/**
 * The hero's stage: checked SDK code beside the interface it produces, on one tray. The code cell
 * holds a `<ProductSample />`; the other is the product at work.
 */
export function Stage({
  title,
  action,
  code,
  tone,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  code: ReactNode;
  /** The product's colour, for the call in its code. */
  tone?: string;
  children: ReactNode;
}) {
  return (
    <CardFrame className="w-full min-w-0 shadow-[0_32px_64px_-32px] shadow-black/24 dark:shadow-black/64">
      <div className="relative flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="min-w-0 truncate font-mono text-muted-foreground text-xs">{title}</span>
        {action ? <span className="flex shrink-0 items-center gap-2">{action}</span> : null}
      </div>
      <Card className="grid min-w-0 overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="stage-code min-w-0 border-b lg:border-e lg:border-b-0" data-tone={tone}>
          {code}
        </div>
        <div className="min-w-0 p-4 sm:p-5">
          <Play>{children}</Play>
        </div>
      </Card>
    </CardFrame>
  );
}

/** One thing the product does: a short claim next to it working. Rows alternate sides. */
export function FeatureRow({
  title,
  body,
  href,
  reverse,
  children,
}: {
  title: string;
  body: ReactNode;
  href?: string;
  reverse?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-12 lg:gap-12">
      <div className={cn("flex flex-col gap-3 lg:col-span-5", reverse && "lg:order-last")}>
        <h3 className="text-balance font-heading font-semibold text-2xl tracking-[-0.01em] sm:text-3xl">
          {title}
        </h3>
        <div className="text-pretty text-lg text-muted-foreground leading-snug">{body}</div>
        {href ? <LearnMore href={href} title={title} /> : null}
      </div>
      <div className="min-w-0 lg:col-span-7">{children}</div>
    </div>
  );
}

/** A smaller feature: the product working, with its claim under it. */
export function FeatureCell({
  title,
  body,
  href,
  children,
}: {
  title: string;
  body: ReactNode;
  href?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {children}
      <div className="flex flex-col gap-1.5 px-1">
        <h3 className="font-heading font-semibold text-xl tracking-[-0.01em]">{title}</h3>
        <div className="text-pretty text-muted-foreground leading-snug">{body}</div>
        {href ? <LearnMore href={href} title={title} /> : null}
      </div>
    </div>
  );
}

function LearnMore({ href, title }: { href: string; title: string }) {
  const label = href.startsWith("/docs") ? "Read the docs" : "See how";
  return (
    <Link
      aria-label={`${title}: ${label.toLowerCase()}`}
      className="group inline-flex w-fit items-center gap-1 font-medium text-sm hover:underline"
      href={href}
    >
      {label}
      <ArrowRightIcon
        aria-hidden
        className="size-3.5 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/** One row of `<Facts>`. */
export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-right font-mono text-[0.8125rem] tabular-nums">{children}</dd>
    </div>
  );
}

/** Every answer stays in the page (crawlers and answer engines read what's rendered). */
export function FaqList({ faq }: { faq: readonly { question: string; answer: string }[] }) {
  if (!faq.length) return null;
  return (
    <Band id="faq">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-4">
          <Heading id="faq-title" title="Questions" />
        </div>
        <Accordion className="lg:col-span-8">
          {faq.map(({ question, answer }) => (
            <AccordionItem key={question} value={question}>
              <AccordionTrigger className="text-base">{question}</AccordionTrigger>
              <AccordionPanel className="max-w-2xl text-base leading-snug" keepMounted>
                {answer}
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Band>
  );
}

export interface OnwardLink {
  href: string;
  title: string;
  /** A product slug: its tile. */
  slug?: string;
}

/** Compact links onward, each one line of copy at most. */
export function OnwardLinks({
  id,
  title,
  lede,
  links,
}: {
  id: string;
  title: string;
  lede?: string;
  links: readonly OnwardLink[];
}) {
  if (!links.length) return null;
  return (
    <Band>
      <Heading id={id} lede={lede} title={title} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              className="group flex h-full items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs/5 transition-colors hover:bg-accent/50"
              href={link.href}
            >
              {link.slug ? <ProductTile size="sm" slug={link.slug} /> : null}
              <span className="min-w-0 flex-1 truncate font-medium">{link.title}</span>
              <ArrowRightIcon
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Band>
  );
}

/** The close: one heading, sign-up, and the line to hand a coding agent. */
export function Close({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Band>
      <CardFrame className="gap-8 p-6 sm:p-10">
        <div className="relative flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-end lg:gap-10">
          <h2
            className="text-balance font-heading font-semibold text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] tracking-[-0.015em] lg:col-span-8"
            id="close-title"
          >
            {title}
          </h2>
          <div className="flex flex-col gap-5 lg:col-span-4 lg:pb-1">
            {children ? (
              <div className="text-pretty text-lg text-muted-foreground leading-snug">
                {children}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2.5">
              <SignUpButton size="lg" />
              <Button
                className="px-5"
                render={<Link href="/pricing" />}
                size="lg"
                variant="outline"
              >
                Pricing
              </Button>
            </div>
          </div>
        </div>
        <div className="relative">
          <CopyPrompt />
        </div>
      </CardFrame>
    </Band>
  );
}
