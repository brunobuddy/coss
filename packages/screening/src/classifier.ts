/**
 * The swap point: anything that can score a message's content per category. The AI SDK adapter
 * (`@coss/screening/ai`) is the production one; `fakeClassifier` (`./testing`) serves local
 * development and tests.
 */

/** Products whose messages are screened; each keeps its own sampling counter. */
export const SCREENING_PRODUCTS = ["email", "sms", "broadcast"] as const;
export type ScreeningProduct = (typeof SCREENING_PRODUCTS)[number];

export const SCREENING_CATEGORIES = ["spam", "phishing", "malware", "fraud"] as const;
export type ScreeningCategory = (typeof SCREENING_CATEGORIES)[number];

/**
 * What a classifier sees: bounded text and, for email, downloaded image bytes. `text` is content
 * people post on a customer's platform (a profile bio, a comment, a listing), classified for
 * coss.com Risk.
 */
export type ScreeningContent =
  | {
      kind: "email";
      from: string;
      subject: string;
      text: string;
      links: string[];
      /** Downloaded by the product with SSRF checks; never pass customer URLs to the model. */
      images?: { data: Uint8Array; mediaType: string }[];
    }
  | { kind: "sms"; from: string; body: string; links: string[] }
  | { kind: "text"; text: string; links: string[] };

export type ClassifierVerdict = {
  /** Probability (0..1) that the message belongs to each category. */
  scores: Record<ScreeningCategory, number>;
  /** The model that answered, when the classifier knows it. */
  model: string | null;
  inputTokens: number | null;
};

export type ContentClassifier = {
  /** Recorded on every screening, e.g. `ai` or `fake`. */
  readonly name: string;
  classify(content: ScreeningContent, signal: AbortSignal): Promise<ClassifierVerdict>;
};

/** The highest-scoring category (ties keep `SCREENING_CATEGORIES` order). */
export function topCategory(scores: Record<ScreeningCategory, number>): {
  category: ScreeningCategory;
  score: number;
} {
  let top: { category: ScreeningCategory; score: number } = { category: "spam", score: -1 };
  for (const category of SCREENING_CATEGORIES) {
    if (scores[category] > top.score) top = { category, score: scores[category] };
  }
  return top;
}
