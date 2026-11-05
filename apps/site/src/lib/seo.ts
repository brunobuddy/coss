import { PLANS, SELF_SERVE_PLANS } from "@coss/billing/catalog";
import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

/*
 * Metadata and schema.org payloads for coss.com's own pages. They serve two audiences: crawlers
 * building results, and the answer engines that read a page to cite it. kloq keeps its own
 * (`src/lib/calendar/structured-data.ts`).
 */

/** An absolute coss.com URL. */
export function abs(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

/**
 * coss.com's default card (`src/app/opengraph-image.tsx`). A page that sets `openGraph` replaces
 * its parents' whole object, image included, so pages name it themselves. Images named here also
 * replace a segment's own `opengraph-image` file: pages that have one pass `ownImage`.
 */
export const DEFAULT_IMAGE = "/opengraph-image";

/** A description for search results: plain text, cut at a sentence or word within 160 characters. */
export function metaDescription(text: string): string {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`|\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 160) return plain;
  const head = plain.slice(0, 160);
  const sentence = Math.max(head.lastIndexOf(". "), head.endsWith(".") ? 159 : -1);
  if (sentence >= 70) return head.slice(0, sentence + 1);
  return `${head.slice(0, head.lastIndexOf(" ", 159)).replace(/[,;:]$/, "")}…`;
}

/**
 * A page's metadata: an absolute title (pages here are written for their search query, so the
 * root layout's `· coss.com` template would only repeat it), the description, the canonical URL,
 * Open Graph and Twitter with the default card (unless `ownImage`: the segment's
 * `opengraph-image` file). `markdown` is the page's `.md` twin, for agents.
 */
export function pageMetadata({
  title,
  description,
  path,
  type = "website",
  markdown,
  ownImage = false,
  image = DEFAULT_IMAGE,
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  markdown?: string;
  ownImage?: boolean;
  /** The card, when it isn't the default and its URL is known. */
  image?: string;
}): Metadata {
  const images = ownImage ? {} : { images: [image] };
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: path,
      ...(markdown ? { types: { "text/markdown": markdown } } : {}),
    },
    openGraph: { type, url: path, siteName: SITE_NAME, title, description, ...images },
    twitter: { card: "summary_large_image", title, description, ...images },
  };
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

const ORGANIZATION = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: SITE_NAME,
  alternateName: "coss",
  url: SITE_URL,
  logo: abs("/site-assets/logo-512.png"),
  description: SITE_DESCRIPTION,
  parentOrganization: { "@type": "Organization", name: "Cal.com, Inc.", url: "https://cal.com" },
  sameAs: [
    "https://github.com/cosscom/coss",
    "https://www.npmjs.com/package/coss",
    "https://x.com/coss_com",
    "https://www.linkedin.com/company/cosscom",
  ],
};

export function organizationSchema() {
  return { "@context": "https://schema.org", ...ORGANIZATION };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "coss",
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/** The self-serve plans as schema.org offers (USD per month, the fee being usage credit). */
function offers() {
  return SELF_SERVE_PLANS.map((key) => ({
    "@type": "Offer",
    name: PLANS[key].name,
    description: PLANS[key].description,
    price: (Number(PLANS[key].feeCents) / 100).toFixed(2),
    priceCurrency: "USD",
    url: abs("/pricing"),
  }));
}

/** A product page: the product as a web API (a SoftwareApplication with the plans as offers). */
export function productSchema({
  name,
  description,
  path,
  features,
}: {
  name: string;
  description: string;
  path: string;
  features?: readonly string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${SITE_NAME} ${name}`,
    url: abs(path),
    description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any (HTTPS API)",
    ...(features?.length ? { featureList: [...features] } : {}),
    offers: offers(),
    provider: { "@id": ORGANIZATION_ID },
  };
}

/** Free software of ours with its own pages (Shipyard): not priced by the plans. */
export function freeSoftwareSchema({
  name,
  description,
  path,
  operatingSystem,
  repository,
}: {
  name: string;
  description: string;
  path: string;
  operatingSystem: string;
  repository: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    url: abs(path),
    description,
    applicationCategory: "DeveloperApplication",
    operatingSystem,
    offers: { "@type": "Offer", price: "0.00", priceCurrency: "USD" },
    provider: { "@id": ORGANIZATION_ID },
    sameAs: [repository],
  };
}

/** The pricing page: coss.com with its self-serve plans. */
export function pricingSchema(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: SITE_NAME,
    description,
    url: abs("/pricing"),
    brand: { "@id": ORGANIZATION_ID },
    offers: offers(),
  };
}

export function aboutPageSchema(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `About ${SITE_NAME}`,
    url: abs("/about"),
    description,
    mainEntity: ORGANIZATION,
  };
}

/** A hub page's list of what it links to. */
export function itemListSchema(items: readonly (readonly [name: string, path: string])[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      url: abs(path),
    })),
  };
}

export function faqSchema(faq: readonly { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

/** The trail from the home page to a page: `[["Products", "/products"], ["Inboxes", "/products/inboxes"]]`. */
export function breadcrumbSchema(trail: readonly (readonly [name: string, path: string])[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"] as const, ...trail].map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: abs(path),
    })),
  };
}

/** An article (a comparison, a docs page) by coss.com, dated when it was last checked. */
export function articleSchema({
  type = "Article",
  title,
  description,
  path,
  modified,
}: {
  type?: "Article" | "TechArticle";
  title: string;
  description?: string;
  path: string;
  /** YYYY-MM-DD. */
  modified?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": type,
    headline: title,
    ...(description ? { description } : {}),
    url: abs(path),
    ...(modified ? { dateModified: modified } : {}),
    author: { "@id": ORGANIZATION_ID },
    publisher: ORGANIZATION,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  };
}
