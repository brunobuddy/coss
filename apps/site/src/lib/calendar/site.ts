import { SITE_URL } from "../site.ts";

/**
 * URL helpers of kloq's pages (coss.com/kloq's `lib/site.ts`): every path is written in
 * full (`/kloq/docs/theming`), so there is no base path to add any more.
 */

/** Absolute URL for a site-relative path. `canonical("/kloq/docs/theming")`. */
export const abs = (path: string): string => new URL(path, SITE_URL).toString();

/** Compact host and path for labels. */
export const siteLabel = (path: string): string => {
  const url = new URL(abs(path));
  return `${url.host.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`;
};

/** kloq's card (`/kloq/og.png`). A page's `openGraph` drops its parents' image, so each names it. */
export const OG_IMAGE = "/kloq/og.png";

/** The `alternates` block every indexable page carries. */
export const canonical = (path: string): { canonical: string } => ({ canonical: abs(path) });
