import type { ReactNode } from "react";

/** One step of a job: a short claim and the product doing it. */
export interface SolutionStep {
  title: string;
  /** One sentence, two at most. Detail belongs in the docs and the `.md` twin. */
  body: ReactNode;
  /** The docs or product page with the rest. */
  href?: string;
  demo: ReactNode;
}

/**
 * What a solution page shows beyond its MDX: the stage's interface and 3–4 steps. Text here names
 * real events, statuses and limits and never a price (those come from the catalog's components in
 * the MDX).
 */
export interface SolutionShowcase {
  /** The hero's one sentence, shorter than the page's meta description. */
  lede: string;
  /** The stage's title: the calls it shows, as they appear in the sample. */
  call: string;
  /** The stage's right cell: what those calls produce. */
  stage: ReactNode;
  steps: readonly SolutionStep[];
}
