import type { ComponentType, ReactNode } from "react";
import { Band, Fact, Facts, Heading, Tray } from "@/components/marketing/kit";
import { getMDXComponents } from "@/components/mdx";
import { PricePanel } from "@/components/pricing/price-panel";
import { pagePricing } from "@/lib/page-pricing";

/*
 * What the page shows of a product's MDX. The MDX is the whole product (its `.md` twin for agents
 * and search); the page picks out the checked sample, the limits and the meters it prices, so they
 * have one source. Anything else in the body stays in the twin and the docs.
 */

// biome-ignore lint/suspicious/noExplicitAny: each collection types its own MDX components.
type MDXBody = ComponentType<any>;

const nothing = () => null;

/** Every sheet component the MDX names (it must be defined, even where it renders nothing). */
const SHEET = { Features: nothing, Feature: nothing, Specs: nothing, Spec: nothing };

/** The `<HeroSample>` of a page: its Twoslash-checked code, in the stage. */
export function ProductSample({ body: Body }: { body: MDXBody }) {
  return (
    <Body
      components={getMDXComponents({
        ...SHEET,
        Section: nothing,
        HeroSample: ({ children }: { children: ReactNode }) => <>{children}</>,
      } as never)}
    />
  );
}

/** One `<Section>` of the page's MDX, by title, with no heading of its own. */
function SectionOf({
  body: Body,
  titles,
  components,
}: {
  body: MDXBody;
  titles: readonly string[];
  components?: Record<string, unknown>;
}) {
  return (
    <Body
      components={getMDXComponents({
        ...SHEET,
        HeroSample: nothing,
        ...components,
        Section: ({ title, children }: { title: string; children: ReactNode }) =>
          titles.includes(title) ? children : null,
      } as never)}
    />
  );
}

/** The page's limits: its "Specifications" section. */
function ProductLimits({ body }: { body: MDXBody }) {
  return (
    <SectionOf
      body={body}
      components={{
        Specs: Facts,
        Spec: ({ label, children }: { label: string; children: ReactNode }) => (
          <Fact label={label}>{children}</Fact>
        ),
        p: nothing,
      }}
      titles={["Specifications"]}
    />
  );
}

/**
 * The page's pricing and limits, one band: how it's billed, a tray of prices drawn from the
 * catalog, and a tray of limits, the same width. A page with neither shows nothing.
 */
export function PricingAndLimits({
  body,
  markdown,
  docs,
}: {
  body: MDXBody;
  markdown: string;
  docs?: string;
}) {
  const pricing = pagePricing(markdown);
  const limits = /<Section title="Specifications"/.test(markdown);
  if (!pricing && !limits) return null;
  return (
    <Band muted>
      <Heading
        lede={pricing?.lede}
        link={docs ? { href: docs, label: "Full details in the docs" } : undefined}
        title={pricing ? "Pricing and limits" : "Limits"}
      />
      <div className="flex flex-col gap-6">
        {pricing ? <PricePanel pricing={pricing} /> : null}
        {limits ? (
          <Tray title={pricing ? "Limits" : undefined}>
            <ProductLimits body={body} />
          </Tray>
        ) : null}
      </div>
    </Band>
  );
}
