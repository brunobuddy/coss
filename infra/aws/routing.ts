/**
 * coss.com's edge routing, derived from ZONE_ROUTES (@coss/auth/slugs) so a new site path can't
 * be missed: ALB listener rules pick the app, CloudFront behaviours decide caching and send the
 * external zones (the coss ui repository's apps, qnot) to their own origins (they run outside
 * AWS, which an ALB can't forward to).
 */
import { SITE_ASSET_PREFIX, ZONE_ROUTES, type ZoneRoute } from "@coss/auth/slugs";

export type TargetGroup = "web" | "site" | "portal" | "sign" | "scheduling" | "api";

/**
 * CloudFront origins of the coss.com distribution: the ALB (every app in ECS), and one per
 * external zone (Vercel projects serving their base path: the coss ui repository's `/ui` and
 * `/origin`, the qnot repository's `/qnot`; their hosts are set at provisioning).
 */
export type ExternalZone = "ui" | "origin" | "qnot";
export type Origin = "alb" | ExternalZone;
export const EXTERNAL_ZONES: readonly ExternalZone[] = ["ui", "origin", "qnot"];

/**
 * External origins are addressed by their own hostname (the Vercel project's production domain),
 * so the viewer's `Host` (coss.com) must not be forwarded to them; the ALB gets everything.
 */
export const EXTERNAL_ORIGIN_REQUEST_POLICY = "Managed-AllViewerExceptHostHeader";

/** The header CloudFront adds to every origin request; the ALB forwards nothing without it. */
export const ORIGIN_VERIFY_HEADER = "X-Origin-Verify";
/** Stands in for the secret's value (Secrets Manager) in the generated rules. */
export const ORIGIN_VERIFY_PLACEHOLDER = "<origin-verify-secret>";

/** Default 60 s; the apps keep idle connections open longer (Next KEEP_ALIVE_TIMEOUT, Bun idleTimeout). */
export const ALB_IDLE_TIMEOUT_SECONDS = 60;

export const DASHBOARD_HOST = "coss.com";
export const API_HOST = "api.coss.com";

/**
 * Tracking links live on their own domain, `cosslinks.com` (a self-serve Cloudflare account for its
 * DNS, separate from coss.com's), so a sender's abuse flagged by URL blocklists never lands on
 * coss.com. This host is the default tracking URL (`TRACKING_PUBLIC_URL`). Customers' tracking
 * domains (e.g. `links.acme.com`) are tenants of a CloudFront multi-tenant distribution instead, and
 * CNAME to its connection group's routing endpoint (`TRACKING_CNAME_TARGET`), not to this host.
 */
export const TRACKING_HOST = "track.cosslinks.com";
/** Added to every origin request by the tracking distributions (its own secret). */
export const TRACKING_ORIGIN_VERIFY_HEADER = "X-Tracking-Origin-Verify";
export const TRACKING_ORIGIN_VERIFY_PLACEHOLDER = "<tracking-origin-verify-secret>";
/**
 * The Hooks portal (apps/portal) lives on a registrable domain of its own, `cosshooks.com` (the
 * self-serve Cloudflare account, like cosslinks.com): under coss.com it would be same-site with the
 * dashboard, and customers embed it in their own pages. A CloudFront distribution of its own adds
 * the secret below, without which the ALB forwards nothing to the portal. The apex redirects to coss.com.
 */
export const PORTAL_HOST = "portal.cosshooks.com";
export const PORTAL_ORIGIN_VERIFY_HEADER = "X-Portal-Origin-Verify";
export const PORTAL_ORIGIN_VERIFY_PLACEHOLDER = "<portal-origin-verify-secret>";
/**
 * Sign's signing app (apps/sign) lives on a registrable domain of its own too, `cosssign.com` (the
 * same self-serve Cloudflare account): signers open its links from emails and customers embed it.
 * Set up like the portal, but on the apex, which signing links point at; `www` redirects to it.
 */
export const SIGN_HOST = "cosssign.com";
export const SIGN_ORIGIN_VERIFY_HEADER = "X-Sign-Origin-Verify";
export const SIGN_ORIGIN_VERIFY_PLACEHOLDER = "<sign-origin-verify-secret>";

/**
 * Forms' public endpoint and hosted pages (`/f/*`, served by the api) live on a registrable domain
 * of their own, so phishing reports about a form never land on coss.com. Set up like Sign's; only
 * `/f/*` reaches the api.
 */
export const FORMS_HOST = "cossforms.com";
export const FORMS_ORIGIN_VERIFY_HEADER = "X-Forms-Origin-Verify";
export const FORMS_ORIGIN_VERIFY_PLACEHOLDER = "<forms-origin-verify-secret>";
/** The only paths the forms host serves. */
export const FORMS_PATH_PATTERN = "/f/*";

/**
 * Scheduling's hosted pages (`apps/scheduling`) on a registrable domain of their own, set up like Sign's.
 */
export const SCHEDULING_HOST = "cossbook.com";
export const SCHEDULING_ORIGIN_VERIFY_HEADER = "X-Scheduling-Origin-Verify";
export const SCHEDULING_ORIGIN_VERIFY_PLACEHOLDER = "<scheduling-origin-verify-secret>";

/** The API's open pixel and click redirect routes, the only paths custom hostnames serve. */
export const TRACKING_PATH_PATTERN = "/t/*";

/**
 * ALB limits each rule to 5 condition values (and 5 wildcards). Site rules spend up to two on the
 * origin header (old + new value while the secret rotates), which leaves 3 path patterns per rule.
 */
const PATHS_PER_RULE = 3;

/** ALB path patterns (case-sensitive, `*` wildcard) for one zone route. */
export function albPathPatterns(route: ZoneRoute): string[] {
  if (!route.prefix || route.path === "/") return [route.path];
  return [route.path, `${route.path}/*`];
}

/**
 * The registrable domains that keep apart from coss.com, each behind a CloudFront distribution of
 * its own that adds its host's origin header. Only Next's hashed assets are cached.
 */
export type HostedDistribution = {
  host: string;
  originVerifyHeader: string;
  originVerifySecret: string;
  waf: "hosted" | "tracking";
  cachedBehaviours: CacheBehaviour[];
};

const NEXT_ASSETS: CacheBehaviour[] = [
  {
    pathPattern: "/_next/static/*",
    origin: "alb",
    cache: "origin",
    reason: "Hashed, immutable assets of the hosted Next apps.",
  },
];

export function hostedDistributions(): Record<string, HostedDistribution> {
  return {
    portal: {
      host: PORTAL_HOST,
      originVerifyHeader: PORTAL_ORIGIN_VERIFY_HEADER,
      originVerifySecret: PORTAL_ORIGIN_VERIFY_PLACEHOLDER,
      waf: "hosted",
      cachedBehaviours: NEXT_ASSETS,
    },
    sign: {
      host: SIGN_HOST,
      originVerifyHeader: SIGN_ORIGIN_VERIFY_HEADER,
      originVerifySecret: SIGN_ORIGIN_VERIFY_PLACEHOLDER,
      waf: "hosted",
      cachedBehaviours: NEXT_ASSETS,
    },
    scheduling: {
      host: SCHEDULING_HOST,
      originVerifyHeader: SCHEDULING_ORIGIN_VERIFY_HEADER,
      originVerifySecret: SCHEDULING_ORIGIN_VERIFY_PLACEHOLDER,
      waf: "hosted",
      cachedBehaviours: NEXT_ASSETS,
    },
    forms: {
      host: FORMS_HOST,
      originVerifyHeader: FORMS_ORIGIN_VERIFY_HEADER,
      originVerifySecret: FORMS_ORIGIN_VERIFY_PLACEHOLDER,
      waf: "hosted",
      cachedBehaviours: [],
    },
    tracking: {
      host: TRACKING_HOST,
      originVerifyHeader: TRACKING_ORIGIN_VERIFY_HEADER,
      originVerifySecret: TRACKING_ORIGIN_VERIFY_PLACEHOLDER,
      waf: "tracking",
      cachedBehaviours: [],
    },
  };
}

/** Hosts that only redirect. `keepPath` appends the request's path and query to `to`. */
export const HOSTED_REDIRECTS: Record<string, { to: string; keepPath: boolean }> = {
  "www.cosssign.com": { to: `https://${SIGN_HOST}`, keepPath: true },
  "www.cossbook.com": { to: `https://${SCHEDULING_HOST}`, keepPath: true },
  "www.cossforms.com": { to: `https://${FORMS_HOST}`, keepPath: true },
  "cosshooks.com": { to: `https://${DASHBOARD_HOST}/`, keepPath: false },
  "cosslinks.com": { to: `https://${DASHBOARD_HOST}/`, keepPath: false },
  "www.coss.com": { to: `https://${DASHBOARD_HOST}`, keepPath: true },
  "ui.coss.com": { to: `https://${DASHBOARD_HOST}/ui`, keepPath: true },
  "mail.coss.com": { to: "https://mail.google.com/a/coss.com", keepPath: false },
  "calendar.coss.com": { to: "https://www.google.com/calendar/hosted/coss.com", keepPath: false },
  "drive.coss.com": { to: "https://drive.google.com/a/coss.com", keepPath: false },
};

/** Where anything on the forms host outside `/f/*` goes. */
export const FORMS_OTHER_PATHS_REDIRECT = `https://${DASHBOARD_HOST}/docs/forms`;

/** One listener rule in the shape of `aws elbv2 create-rule --conditions`. */
export type ListenerRule = {
  priority: number;
  targetGroup: TargetGroup;
  conditions: (
    | { Field: "host-header"; HostHeaderConfig: { Values: string[] } }
    | { Field: "path-pattern"; PathPatternConfig: { Values: string[] } }
    | { Field: "http-header"; HttpHeaderConfig: { HttpHeaderName: string; Values: string[] } }
  )[];
};

/**
 * The HTTPS listener's rules, in priority order. The listener's default action is a fixed 403:
 * a request without one of CloudFront's origin headers matches no rule.
 * api.coss.com goes first, so the coss.com rules don't need a host condition; then the tracking
 * routes on any host (customer tracking domains, from CloudFront), the Hooks portal and Sign's
 * signing app (each with its own header); then the dashboard (default zone) and, after it, Forms'
 * and Scheduling's hosts (each with its own header).
 */
export function albListenerRules(): ListenerRule[] {
  const verified = {
    Field: "http-header" as const,
    HttpHeaderConfig: { HttpHeaderName: ORIGIN_VERIFY_HEADER, Values: [ORIGIN_VERIFY_PLACEHOLDER] },
  };
  const rules: Omit<ListenerRule, "priority">[] = [
    {
      targetGroup: "api",
      conditions: [{ Field: "host-header", HostHeaderConfig: { Values: [API_HOST] } }, verified],
    },
    {
      targetGroup: "api",
      conditions: [
        { Field: "path-pattern", PathPatternConfig: { Values: [TRACKING_PATH_PATTERN] } },
        {
          Field: "http-header",
          HttpHeaderConfig: {
            HttpHeaderName: TRACKING_ORIGIN_VERIFY_HEADER,
            Values: [TRACKING_ORIGIN_VERIFY_PLACEHOLDER],
          },
        },
      ],
    },
    {
      targetGroup: "portal",
      conditions: [
        { Field: "host-header", HostHeaderConfig: { Values: [PORTAL_HOST] } },
        {
          Field: "http-header",
          HttpHeaderConfig: {
            HttpHeaderName: PORTAL_ORIGIN_VERIFY_HEADER,
            Values: [PORTAL_ORIGIN_VERIFY_PLACEHOLDER],
          },
        },
      ],
    },
    {
      targetGroup: "sign",
      conditions: [
        { Field: "host-header", HostHeaderConfig: { Values: [SIGN_HOST] } },
        {
          Field: "http-header",
          HttpHeaderConfig: {
            HttpHeaderName: SIGN_ORIGIN_VERIFY_HEADER,
            Values: [SIGN_ORIGIN_VERIFY_PLACEHOLDER],
          },
        },
      ],
    },
  ];
  // External zones never reach the ALB: CloudFront sends them to their own origins.
  const sitePatterns = (ZONE_ROUTES as readonly ZoneRoute[])
    .filter((route) => route.zone === "site")
    .flatMap(albPathPatterns);
  const siteRules: Omit<ListenerRule, "priority">[] = [];
  for (let index = 0; index < sitePatterns.length; index += PATHS_PER_RULE) {
    siteRules.push({
      targetGroup: "site",
      conditions: [
        {
          Field: "path-pattern",
          PathPatternConfig: { Values: sitePatterns.slice(index, index + PATHS_PER_RULE) },
        },
        verified,
      ],
    });
  }
  const tail: Omit<ListenerRule, "priority">[] = [];
  tail.push({
    targetGroup: "web",
    conditions: [
      { Field: "host-header", HostHeaderConfig: { Values: [DASHBOARD_HOST] } },
      verified,
    ],
  });
  // After the dashboard, not with the other hosts: a rule inserted mid-list renumbers every rule
  // after it, which Terraform rewrites one at a time under live traffic. Its host and header
  // match nothing above, so its place changes nothing else.
  tail.push({
    targetGroup: "api",
    conditions: [
      { Field: "host-header", HostHeaderConfig: { Values: [FORMS_HOST] } },
      { Field: "path-pattern", PathPatternConfig: { Values: [FORMS_PATH_PATTERN] } },
      {
        Field: "http-header",
        HttpHeaderConfig: {
          HttpHeaderName: FORMS_ORIGIN_VERIFY_HEADER,
          Values: [FORMS_ORIGIN_VERIFY_PLACEHOLDER],
        },
      },
    ],
  });
  tail.push({
    targetGroup: "scheduling",
    conditions: [
      { Field: "host-header", HostHeaderConfig: { Values: [SCHEDULING_HOST] } },
      {
        Field: "http-header",
        HttpHeaderConfig: {
          HttpHeaderName: SCHEDULING_ORIGIN_VERIFY_HEADER,
          Values: [SCHEDULING_ORIGIN_VERIFY_PLACEHOLDER],
        },
      },
    ],
  });
  // Gaps of 10 leave room for manual rules (maintenance pages, …). Site rules past the first
  // `SITE_RULES_ON_TENS` take the free priorities just below the dashboard's instead (…, 121, 122):
  // Terraform keys rules by priority, so renumbering the dashboard's rule would rewrite it in place
  // into a site rule, and coss.com would answer 403 until the dashboard's new rule was created.
  const numbered: ListenerRule[] = [];
  const push = (rule: Omit<ListenerRule, "priority">, priority: number) => {
    numbered.push({ priority, ...rule });
  };
  for (const rule of rules) push(rule, (numbered.length + 1) * 10);
  const tens = Math.min(siteRules.length, SITE_RULES_ON_TENS);
  for (const rule of siteRules.slice(0, tens)) push(rule, (numbered.length + 1) * 10);
  const lastTen = numbered.length * 10;
  siteRules.slice(tens).forEach((rule, index) => {
    if (index >= 9) throw new Error("More site rules than the gap below the dashboard's holds.");
    push(rule, lastTen + index + 1);
  });
  const firstTail = (rules.length + tens + 1) * 10;
  for (const [index, rule] of tail.entries()) push(rule, firstTail + index * 10);
  return numbered;
}

/**
 * How many site rules are numbered in steps of 10 (the ones live when the overflow scheme came
 * in): the rest go in the gap below the dashboard's rule (`albListenerRules`).
 */
const SITE_RULES_ON_TENS = 8;

export type CacheBehaviour = {
  /** CloudFront path pattern. */
  pathPattern: string;
  origin: Origin;
  /** "origin": honour the origin's Cache-Control (`coss-origin-cache-control` cache policy). */
  cache: "origin";
  reason: string;
};

/**
 * Cached behaviours of the coss.com distribution. Everything else (the default `*` behaviour:
 * dashboard, `/api/auth`, the landing page `/`) is never cached. CloudFront path patterns can't
 * express "exactly /", so the landing page is served uncached; it is a cheap static page.
 */
export function cossComCacheBehaviours(): CacheBehaviour[] {
  const behaviours: CacheBehaviour[] = [
    {
      pathPattern: "/_next/static/*",
      origin: "alb",
      cache: "origin",
      reason:
        "The dashboard's hashed, immutable assets (and old chunks for tabs opened before a deploy).",
    },
  ];
  for (const route of ZONE_ROUTES as readonly ZoneRoute[]) {
    if (route.path === "/") continue;
    const patterns = route.prefix
      ? // The asset prefix has no page of its own.
        route.path === SITE_ASSET_PREFIX
        ? [`${route.path}/*`]
        : [route.path, `${route.path}/*`]
      : [route.path];
    for (const pathPattern of patterns) {
      behaviours.push({
        pathPattern,
        origin: route.zone === "site" ? "alb" : route.zone,
        cache: "origin",
        reason: `${route.zone} zone (${route.path})`,
      });
    }
  }
  return behaviours;
}

/** Cached paths whose names are content hashes: a new build never reuses one. */
const IMMUTABLE_PATTERNS = new Set(["/_next/static/*", `${SITE_ASSET_PREFIX}/*`]);

/**
 * What the Deploy workflow invalidates on the coss.com distribution after a rollout: our own
 * apps' cached paths (docs pages are cached for a year). Never the hashed asset folders, whose
 * cached old chunks keep tabs opened before the deploy working (the new tasks don't have them),
 * nor the external zones, which deploy on their own.
 *
 * A page's path ends in `*`: CloudFront invalidates a path without a wildcard only without a query
 * string, and the RSC payloads of client-side navigations are cached as `/pricing?_rsc=…`, a key
 * that stays the same across builds. Left behind, they name the previous build's chunks, which the
 * new tasks don't have (WEB-P). `/docs*` also covers `/docs/*`, so a prefix route is one path
 * (CloudFront allows 15 wildcard paths in progress). Files (`/llms.txt`) have no payloads.
 */
export function deployInvalidationPaths(): string[] {
  const paths = new Set<string>();
  for (const { origin, pathPattern } of cossComCacheBehaviours()) {
    if (origin !== "alb" || IMMUTABLE_PATTERNS.has(pathPattern)) continue;
    const path = pathPattern.replace(/\/\*$/, "");
    paths.add(/\/[^/.][^/]*\.[a-z]+$/.test(path) ? pathPattern : `${path}*`);
  }
  return [...paths];
}

/**
 * Request headers that select a different Next.js response for the same URL (Next's `Vary`);
 * they must be in the cache key of every cached behaviour, along with all query strings (`_rsc`).
 */
export const NEXT_CACHE_KEY_HEADERS = [
  "RSC",
  "Next-Router-Prefetch",
  "Next-Router-State-Tree",
  "Next-Router-Segment-Prefetch",
] as const;
