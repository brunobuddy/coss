// Pure (no React Native imports) so `bun test` can load it.

const EMAIL = ["templates", "received", "suppressions", "subaccounts", "tracking"];
const MARKETING = ["contacts", "audiences", "segments", "topics"];
const DEVELOPERS = ["api-keys", "webhooks", "logs", "log-drains", "import"];

function environmentRest(rest: string): string {
  const [first = "", ...tail] = rest.split("/").filter(Boolean);
  const after = tail.length > 0 ? `/${tail.join("/")}` : "";
  if (first === "") return "";
  if (first === "products") return tail[0] ? `/${tail[0]}` : "/products";
  if (first === "emails") return `/email/messages${after}`;
  if (first === "content-storage") return `/email/storage${after}`;
  if (EMAIL.includes(first)) return `/email/${first}${after}`;
  if (first === "marketing") return `/marketing/settings${after}`;
  if (first === "broadcasts") return `/marketing${after}`;
  if (MARKETING.includes(first)) return `/marketing/${first}${after}`;
  if (DEVELOPERS.includes(first)) return `/developers/${first}${after}`;
  return `/${first}${after}`;
}

/**
 * The dashboard path of one of the app's routes. The app keeps the routes the dashboard had
 * (`/<org>/projects/<project>/<env>/emails`); the dashboard moved to product-first paths
 * (`/<org>/<project>/<env>/email/messages`, `/<org>/settings/members`), and organization pages that
 * belong to a product open in the environment last used (`/<org>?to=/email/domains`).
 */
export function dashboardPath(appPath: string): string {
  const [pathname = "", query] = appPath.split("?");
  const search = query ? `?${query}` : "";
  const env = pathname.match(/^\/([^/]+)\/projects\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (env) return `/${env[1]}/${env[2]}/${env[3]}${environmentRest(env[4] ?? "")}${search}`;
  const org = pathname.match(
    /^\/([^/]+)\/(domains|dedicated-ips|reputation|sms|members|spend)(\/.*)?$/,
  );
  if (!org) return appPath;
  const [, slug, first, after = ""] = org;
  if (first === "members" || first === "spend")
    return `/${slug}/settings/${first}${after}${search}`;
  const to = first === "sms" ? `/sms/numbers${after}` : `/email/${first}${after}`;
  return `/${slug}?to=${encodeURIComponent(to + search)}`;
}
