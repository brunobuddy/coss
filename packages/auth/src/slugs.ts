/**
 * Organization slug rules and coss.com's routing between apps (client-safe). Org slugs are the
 * dashboard's first URL segment (`coss.com/acme`), so they share one namespace with every other
 * top-level path on coss.com.
 */

/**
 * coss.com is served by several apps (Next.js multi-zones). The dashboard (apps/web) is the default
 * zone: it serves every path not listed in `ZONE_ROUTES`, including org slugs and `/api/auth/*`.
 */
export type Zone = "dashboard" | "site" | "ui" | "origin" | "qnot";

/**
 * A path served by an app other than the dashboard. `prefix` routes match the path itself and
 * everything below it (`/docs` and `/docs/…`, never `/docsx`).
 */
export type ZoneRoute = {
  readonly zone: Exclude<Zone, "dashboard">;
  readonly path: string;
  readonly prefix: boolean;
};

/** The dashboard's entry page: signs in, onboards, or opens the user's first organization. */
export const DASHBOARD_PATH = "/dashboard";

/** apps/site's Next.js `assetPrefix`. Only the default zone (the dashboard) serves bare `/_next/*`. */
export const SITE_ASSET_PREFIX = "/site-assets";

/**
 * Every path on coss.com that the dashboard does not serve. The load balancer's listener rules and
 * the CDN's cached behaviours are generated from this list (`infra/aws/routing.ts`), and the
 * site's test fails for any route it serves that is missing here. Adding a site page means: an
 * entry here (unless an existing prefix covers it) + the route in apps/site.
 */
export const ZONE_ROUTES = [
  // apps/site: landing page, pricing, about, the product, comparison and solution pages, Shipyard's landing page (and its assets), kloq
  // kit's pages (landing page, demo, tools, comparisons, docs and its shadcn registry), docs (incl.
  // their search at /docs/search.json), legal pages, LLM text files. Each page route costs one of
  // the deploy's 15 wildcard invalidations (`infra/aws/routing.ts`): group new pages under a prefix,
  // and append new entries after the last site entry (see below).
  { zone: "site", path: "/", prefix: false },
  { zone: "site", path: "/pricing", prefix: false },
  { zone: "site", path: "/about", prefix: false },
  { zone: "site", path: "/shipyard", prefix: true },
  { zone: "site", path: "/kloq", prefix: true },
  { zone: "site", path: "/docs", prefix: true },
  { zone: "site", path: "/legal", prefix: true },
  { zone: "site", path: "/llms.txt", prefix: false },
  { zone: "site", path: "/llms-full.txt", prefix: false },
  { zone: "site", path: SITE_ASSET_PREFIX, prefix: true },
  // Root metadata files belong to the site; the dashboard links to the site's icon.
  { zone: "site", path: "/icon.svg", prefix: false },
  { zone: "site", path: "/favicon.ico", prefix: false },
  { zone: "site", path: "/robots.txt", prefix: false },
  { zone: "site", path: "/sitemap.xml", prefix: false },
  { zone: "site", path: "/.well-known", prefix: true },
  // Appended after the routes that were live before them: the load balancer's rules are numbered
  // in this order, and an entry in the middle would renumber (rewrite) every live rule after it.
  { zone: "site", path: "/products", prefix: true },
  { zone: "site", path: "/compare", prefix: true },
  { zone: "site", path: "/solutions", prefix: true },
  { zone: "site", path: "/opengraph-image", prefix: false },
  // The coss ui repository's apps, deployed outside AWS (Vercel): coss ui and Origin UI.
  { zone: "ui", path: "/ui", prefix: true },
  { zone: "origin", path: "/origin", prefix: true },
  // qnot's site (the cosscom/qnot repository's apps/web), also on Vercel.
  { zone: "qnot", path: "/qnot", prefix: true },
] as const satisfies readonly ZoneRoute[];

/** Which app serves `pathname` on coss.com. */
export function zoneForPath(pathname: string): Zone {
  for (const route of ZONE_ROUTES as readonly ZoneRoute[]) {
    if (pathname === route.path) return route.zone;
    if (route.prefix && pathname.startsWith(`${route.path}/`)) return route.zone;
  }
  return "dashboard";
}

/**
 * First URL segments that must never become org slugs. Paths that aren't valid slugs anyway
 * (`/ui`, `/.well-known`, `/llms.txt`) are harmless here.
 */
const ZONE_SEGMENTS = ZONE_ROUTES.map((route) => route.path.split("/")[1]).filter(
  (segment): segment is string => Boolean(segment),
);

/** Top-level dashboard routes (apps/web/test/reserved-slugs.test.ts checks every one is here). */
const DASHBOARD_SEGMENTS = [
  "dashboard",
  "admin",
  "api",
  "onboarding",
  "sign-in",
  "sign-up",
  "sign-out",
  "accept-invitation",
  "verify-email",
  "forgot-password",
  "reset-password",
  "settings",
  "invite",
  "new",
  // Next.js metadata routes
  "icon",
  "apple-icon",
  "opengraph-image",
  "twitter-image",
  "sitemap",
  "robots",
  "manifest",
];

/**
 * Reserved for future site pages. Org slugs can't be taken back once used, so anything the site
 * might plausibly publish is reserved up front. Slugs are at least 3 characters, so 2-letter
 * locale prefixes (`/de`, `/fr`) are already safe; a localized site must use those, never
 * `xx-yy` region codes (which are valid slugs).
 */
const FUTURE_SITE_SEGMENTS = [
  // Products
  "email",
  "emails",
  "sms",
  "video",
  "voice",
  "calls",
  "chat",
  "push",
  "notifications",
  "scheduling",
  "booking",
  "calendar",
  "bookings",
  "meetings",
  "whatsapp",
  "inbox",
  "inboxes",
  "ai",
  "agents",
  "hooks",
  "webhooks",
  "sign",
  "esign",
  "verify",
  "otp",
  "signatures",
  "documents",
  "contracts",
  "forms",
  "surveys",
  "risk",
  "fraud",
  "subaccounts",
  "sub-accounts",
  "marketing",
  "transactional",
  // Marketing and company pages
  "home",
  "pricing",
  "plans",
  "blog",
  "changelog",
  "roadmap",
  "about",
  "company",
  "team",
  "careers",
  "jobs",
  "customers",
  "case-studies",
  "stories",
  "showcase",
  "contact",
  "contact-sales",
  "sales",
  "demo",
  "enterprise",
  "startups",
  "education",
  "nonprofits",
  "open-source",
  "opensource",
  "oss",
  // Once a site page: its old links must never land on an organization.
  "crowd-opinionated-source-software",
  "features",
  "product",
  "products",
  "platform",
  "solutions",
  "use-cases",
  "integrations",
  "marketplace",
  "partners",
  "affiliates",
  "investors",
  "press",
  "news",
  "brand",
  "compare",
  "alternatives",
  "vs",
  "platforms",
  "templates",
  "examples",
  "resources",
  "guides",
  "tutorials",
  "learn",
  "academy",
  "events",
  "webinars",
  "community",
  "forum",
  "support",
  "help",
  "faq",
  "feedback",
  "download",
  "downloads",
  "developers",
  "reference",
  "api-reference",
  "sdk",
  "sdks",
  "cli",
  "status",
  "uptime",
  // Legal and trust
  "legal",
  "privacy",
  "terms",
  "cookies",
  "security",
  "trust",
  "compliance",
  "gdpr",
  "dpa",
  "sla",
  "subprocessors",
  "imprint",
  // Infrastructure-ish paths that should never be an organization
  "www",
  "app",
  "console",
  "portal",
  "account",
  "billing",
  "login",
  "logout",
  "signin",
  "signup",
  "register",
  "auth",
  "oauth",
  "sso",
  "unsubscribe",
  "preferences",
  "search",
  "static",
  "assets",
  "public",
  "media",
  "images",
  "files",
  "health",
  "healthz",
  "rss",
  "feed",
];

export const RESERVED_ORG_SLUGS: ReadonlySet<string> = new Set([
  ...DASHBOARD_SEGMENTS,
  ...ZONE_SEGMENTS,
  ...FUTURE_SITE_SEGMENTS,
]);

export const ORG_NAME_MAX_LENGTH = 64;

/** Returns an error message, or `null` when the (untrimmed) organization name is valid. */
export function validateOrgName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > ORG_NAME_MAX_LENGTH) {
    return `Name must be 1-${ORG_NAME_MAX_LENGTH} characters.`;
  }
  return null;
}

export const ORG_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

/** Returns an error message, or `null` when the slug is valid. */
export function validateOrgSlug(slug: string): string | null {
  if (!ORG_SLUG_PATTERN.test(slug)) {
    return "Slug must be 3-48 characters: lowercase letters, numbers and dashes, not starting or ending with a dash.";
  }
  if (RESERVED_ORG_SLUGS.has(slug)) return `"${slug}" is reserved.`;
  return null;
}

/** "Acme, Inc." -> "acme-inc" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/, "");
}
