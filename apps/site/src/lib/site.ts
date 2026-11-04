export const SITE_NAME = "coss.com";
export const SITE_URL = "https://coss.com";
/** What coss.com is, in one line: the site's description, its schema and search results. */
export const SITE_DESCRIPTION =
  "One API key and one SDK for transactional email, AI agent inboxes, SMS, one-time codes, forms, scheduling, webhooks and risk checks.";
export const DOCS_ROUTE = "/docs";

/**
 * The one line to hand a coding agent (the landing page and /docs/agents, which must quote it
 * exactly): everything else it reads from /llms.txt, whose brief explains `coss init`.
 */
export const AGENT_PROMPT = `Add coss.com to this project: read ${SITE_URL}/llms.txt, get a development key with \`npx coss-cli init --agents\`, and build and test with it.`;
/** Shiki themes of every code block (source.config.ts and the Shipyard docs' collection). */
export const CODE_THEMES = { light: "github-light", dark: "github-dark" } as const;

export interface NavItem {
  href: string;
  label: string;
  /** Another site: a plain link in a new tab. */
  external?: boolean;
}

/** The header's sections (also the first group of the command menu and the mobile menu). */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: DOCS_ROUTE, label: "Docs" },
  { href: `${DOCS_ROUTE}/api-reference`, label: "API Reference" },
  { href: "/pricing", label: "Pricing" },
];
/** Where Enterprise inquiries go (the pricing page and the billing guide). */
export const SALES_EMAIL = "sales@coss.com";

/** coss.com's API products (the landing, pricing and nav). */
export const PRODUCTS = [
  { key: "email", name: "Email", description: "Transactional email from your own domains." },
  { key: "sms", name: "SMS", description: "Text messages worldwide." },
  { key: "scheduling", name: "Scheduling", description: "Availability and bookings." },
] as const;
/**
 * A page's Markdown twin. Answer engines fetch these and search engines list them, so the header
 * names the HTML page as the one to rank; a noindex would hide them from the first.
 */
export function markdownResponse(markdown: string, path: string): Response {
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${SITE_URL}${path}>; rel="canonical"`,
    },
  });
}

/** The docs' search endpoint. Under /docs: on coss.com, `/api/*` belongs to the dashboard. */
export const SEARCH_API = `${DOCS_ROUTE}/search.json`;

/**
 * The dashboard (apps/web) shares coss.com with this site, so its pages and Better Auth
 * (`/api/auth/*`) are same-origin. In `next dev` it runs on its own port: links point there, and
 * next.config.ts proxies `/api/auth/*` to it (localhost cookies are shared across ports).
 */
export const DEV_DASHBOARD_ORIGIN = "http://localhost:3000";

/** The public API in `next dev` (`bun run dev`): the reference's samples and playground target it first. */
export const DEV_API_ORIGIN = "http://localhost:3001";

/** A dashboard page. Link with `<a>`, not `next/link`: it is another app (zone). */
export function dashboardUrl(path: string): string {
  return process.env.NODE_ENV === "development" ? `${DEV_DASHBOARD_ORIGIN}${path}` : path;
}
