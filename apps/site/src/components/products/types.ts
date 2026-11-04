import type { ReactNode } from "react";

/** One thing a product does: a short claim and the product doing it. */
export interface Highlight {
  title: string;
  /** One sentence, two at most. Detail belongs in the docs and the `.md` twin. */
  body: ReactNode;
  /** The docs page with the rest. */
  href?: string;
  demo: ReactNode;
}

/**
 * What a product page shows beyond its MDX: the stage's interface and 3–5 highlights. Text here
 * names real events, statuses and limits and never a price (those come from the catalog's
 * components in the MDX).
 */
export interface ProductShowcase {
  /** The hero's one sentence, shorter than the page's meta description. */
  lede: string;
  /** The stage's title: the call it shows, as it appears in the sample. */
  call: string;
  /** The stage's right cell: the interface that call produces. */
  stage: ReactNode;
  highlights: readonly Highlight[];
  /** The closing heading, where "Start with <title> today." doesn't read. */
  close?: string;
}
