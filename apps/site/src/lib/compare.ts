/*
 * coss.com compared with the services people search for an alternative to (/compare/<slug>).
 * Every fact about the other service is checked against its own public pages on `checked` and
 * linked in `sources`; coss.com's side is read from the catalog and the code (never a typed-in
 * price or limit: use `rateText`, `includedUnitsText`, `limitText`, `planPriceText` and
 * `plansWithText` from src/lib/billing-text.ts). The tone is an engineer's: say where they are the
 * better choice. The data lives in src/lib/compare-data/.
 */

import { EMAIL_COMPETITORS } from "./compare-data/email";
import { MESSAGING_COMPETITORS } from "./compare-data/messaging";
import { OTHERS_COMPETITORS } from "./compare-data/others";
import { TRUST_COMPETITORS } from "./compare-data/trust";

export interface CompareRow {
  label: string;
  coss: string;
  them: string;
  /** A short qualifier under the row. */
  note?: string;
}

export interface Competitor {
  slug: string;
  name: string;
  /** coss.com's product pages this comparison is about (product slugs). */
  products: readonly string[];
  /** The query the page answers ("Resend alternative"). */
  query: string;
  /** One sentence: the hero and the meta description (at most 160 characters). */
  verdict: string;
  /** Two or three sentences under it. */
  lede: string;
  /** YYYY-MM-DD: when their facts were last checked against `sources`. */
  checked: string;
  rows: readonly CompareRow[];
  chooseThem: readonly { title: string; body: string }[];
  chooseCoss: readonly { title: string; body: string }[];
  /** How to move: steps, with an importer where coss.com has one. */
  migration: readonly { title: string; body: string; href?: string }[];
  faq: readonly { question: string; answer: string }[];
  sources: readonly { label: string; href: string }[];
}

export const COMPARE_ROUTE = "/compare";

export const COMPETITORS: readonly Competitor[] = [
  ...EMAIL_COMPETITORS,
  ...MESSAGING_COMPETITORS,
  ...OTHERS_COMPETITORS,
  ...TRUST_COMPETITORS,
];

export function competitorBySlug(slug: string): Competitor | undefined {
  return COMPETITORS.find((competitor) => competitor.slug === slug);
}

/** The comparisons about a product page. */
export function competitorsFor(product: string): Competitor[] {
  return COMPETITORS.filter((competitor) => competitor.products.includes(product));
}

/** A comparison as Markdown, for /llms.txt and `/compare/<slug>.md`. */
export function compareMarkdown(c: Competitor, url: string): string {
  const cell = (text: string) => text.replaceAll("|", "\\|").replace(/\s*\n\s*/g, " ");
  return [
    `# coss.com vs ${c.name} (${url})`,
    `> ${c.verdict}`,
    c.lede,
    `Facts about ${c.name} checked on ${c.checked} against the sources listed below.`,
    "## At a glance",
    [
      `| | coss.com | ${c.name} |`,
      "| --- | --- | --- |",
      ...c.rows.map(
        (row) =>
          `| ${cell(row.label)} | ${cell(row.coss)} | ${cell(row.them)}${row.note ? ` (${cell(row.note)})` : ""} |`,
      ),
    ].join("\n"),
    `## When ${c.name} is the better choice`,
    c.chooseThem.map((item) => `- **${item.title}.** ${item.body}`).join("\n"),
    "## When coss.com is the better choice",
    c.chooseCoss.map((item) => `- **${item.title}.** ${item.body}`).join("\n"),
    `## Moving from ${c.name}`,
    c.migration
      .map(
        (step, index) =>
          `${index + 1}. **${step.title}.** ${step.body}${step.href ? ` (${step.href})` : ""}`,
      )
      .join("\n"),
    "## Frequently asked questions",
    c.faq.map(({ question, answer }) => `### ${question}\n\n${answer}`).join("\n\n"),
    "## Sources",
    c.sources.map((source) => `- [${source.label}](${source.href})`).join("\n"),
  ].join("\n\n");
}
