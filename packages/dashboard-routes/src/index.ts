/**
 * The dashboard's products and pages, and the paths that reach them. The dashboard's navigation,
 * the iOS app's links, push notifications and emails all read this list.
 *
 * Environment pages live under `/<org>/<project>/<env>`; their `path` is relative to that base.
 * Organization settings live under `/<org>/settings`; their `path` is relative to that.
 */

export type DashboardPage = {
  label: string;
  path: string;
  /** Active only on the exact path, not on its children. */
  exact?: boolean;
  /** Shows the organization's data, the same in every environment. */
  shared?: boolean;
};

export const PRODUCT_CATEGORIES = [
  { key: "email", label: "Email" },
  { key: "messaging", label: "Messaging and identity" },
  { key: "documents", label: "Documents and data" },
  { key: "scheduling", label: "Scheduling" },
  { key: "trust", label: "Events and trust" },
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]["key"];

export const PRODUCT_KEYS = [
  "email",
  "marketing",
  "inboxes",
  "sms",
  "verify",
  "sign",
  "forms",
  "scheduling",
  "hooks",
  "risk",
] as const;

export type ProductKey = (typeof PRODUCT_KEYS)[number];

export type DashboardSection = {
  name: string;
  description: string;
  /** The section's root, relative to the environment base. */
  path: string;
  /** coss.com's docs for it. */
  docs: string;
  pages: readonly DashboardPage[];
};

export type Product = DashboardSection & { key: ProductKey; category: ProductCategory };

export const PRODUCTS: readonly Product[] = [
  {
    key: "email",
    category: "email",
    name: "Email",
    description: "Transactional email from your own domains.",
    path: "/email",
    docs: "/docs/email",
    pages: [
      { label: "Overview", path: "/email", exact: true },
      { label: "Emails", path: "/email/messages" },
      { label: "Templates", path: "/email/templates" },
      { label: "Received", path: "/email/received" },
      { label: "Suppressions", path: "/email/suppressions" },
      { label: "Sub-accounts", path: "/email/subaccounts" },
      { label: "Tracking", path: "/email/tracking" },
      { label: "Content storage", path: "/email/storage" },
      { label: "Domains", path: "/email/domains", shared: true },
      { label: "Dedicated IPs", path: "/email/dedicated-ips", shared: true },
      { label: "Reputation", path: "/email/reputation", shared: true },
    ],
  },
  {
    key: "marketing",
    category: "email",
    name: "Marketing",
    description: "Contacts, segments and broadcasts.",
    path: "/marketing",
    docs: "/docs/email/broadcasts",
    pages: [
      { label: "Broadcasts", path: "/marketing" },
      { label: "Contacts", path: "/marketing/contacts" },
      { label: "Audiences", path: "/marketing/audiences" },
      { label: "Segments", path: "/marketing/segments" },
      { label: "Topics", path: "/marketing/topics" },
      { label: "Settings", path: "/marketing/settings" },
    ],
  },
  {
    key: "inboxes",
    category: "email",
    name: "Inboxes",
    description: "Email addresses for AI agents.",
    path: "/inboxes",
    docs: "/docs/inboxes",
    pages: [{ label: "Inboxes", path: "/inboxes" }],
  },
  {
    key: "sms",
    category: "messaging",
    name: "SMS",
    description: "Text messages worldwide.",
    path: "/sms",
    docs: "/docs/sms",
    pages: [
      { label: "Messages", path: "/sms" },
      { label: "Received", path: "/sms/received" },
      { label: "Suppressions", path: "/sms/suppressions" },
      { label: "Phone numbers", path: "/sms/numbers", shared: true },
    ],
  },
  {
    key: "verify",
    category: "messaging",
    name: "Verify",
    description: "One-time codes by SMS or email.",
    path: "/verify",
    docs: "/docs/verify",
    pages: [
      { label: "Verifications", path: "/verify" },
      { label: "Settings", path: "/verify/settings" },
    ],
  },
  {
    key: "sign",
    category: "documents",
    name: "Sign",
    description: "E-signatures in your app.",
    path: "/sign",
    docs: "/docs/sign",
    pages: [
      { label: "Requests", path: "/sign" },
      { label: "Templates", path: "/sign/templates" },
      { label: "Settings", path: "/sign/settings" },
    ],
  },
  {
    key: "forms",
    category: "documents",
    name: "Forms",
    description: "Form endpoints and hosted forms.",
    path: "/forms",
    docs: "/docs/forms",
    pages: [{ label: "Forms", path: "/forms" }],
  },
  {
    key: "scheduling",
    category: "scheduling",
    name: "Scheduling",
    description: "Availability and bookings for your users.",
    path: "/scheduling",
    docs: "/docs/scheduling",
    pages: [
      { label: "Bookings", path: "/scheduling", exact: true },
      { label: "Hosts", path: "/scheduling/hosts" },
      { label: "Event types", path: "/scheduling/event-types" },
      { label: "Settings", path: "/scheduling/settings" },
    ],
  },
  {
    key: "hooks",
    category: "trust",
    name: "Hooks",
    description: "Webhooks you send to your customers.",
    path: "/hooks",
    docs: "/docs/hooks",
    pages: [
      { label: "Applications", path: "/hooks" },
      { label: "Event types", path: "/hooks/event-types" },
      { label: "Portal settings", path: "/hooks/settings" },
    ],
  },
  {
    key: "risk",
    category: "trust",
    name: "Risk",
    description: "Abuse checks for sign-ups and payments.",
    path: "/risk",
    docs: "/docs/risk",
    pages: [
      { label: "Assessments", path: "/risk" },
      { label: "Rules", path: "/risk/rules" },
      { label: "Lists", path: "/risk/lists" },
      { label: "Rate limits", path: "/risk/limits" },
      { label: "Calibration", path: "/risk/calibration" },
      { label: "Settings", path: "/risk/settings" },
    ],
  },
];

/** Keys, webhooks, logs and imports: every environment has them, whatever it uses. */
export const DEVELOPERS: DashboardSection = {
  name: "Developers",
  description: "API keys, webhooks, logs and imports.",
  path: "/developers",
  docs: "/docs",
  pages: [
    { label: "Overview", path: "/developers", exact: true },
    { label: "API keys", path: "/developers/api-keys" },
    { label: "Webhooks", path: "/developers/webhooks" },
    { label: "Logs", path: "/developers/logs" },
    { label: "Log drains", path: "/developers/log-drains" },
    { label: "Import", path: "/developers/import" },
  ],
};

export type SettingsPage = DashboardPage & { group: "General" | "Billing" | "Security" };

/** The organization's own pages, relative to `/<org>/settings`. */
export const ORGANIZATION_SETTINGS: readonly SettingsPage[] = [
  { label: "General", path: "", exact: true, group: "General" },
  { label: "Projects", path: "/projects", group: "General" },
  { label: "Members", path: "/members", group: "General" },
  { label: "Billing", path: "/billing", group: "Billing" },
  { label: "Spend", path: "/spend", exact: true, group: "Billing" },
  { label: "Budgets", path: "/spend/budgets", group: "Billing" },
  { label: "Single sign-on", path: "/sso", group: "Security" },
  { label: "Directory sync", path: "/scim", group: "Security" },
  { label: "Audit log", path: "/audit", group: "Security" },
];

/** Project slugs that are taken by the organization's own pages (`/<org>/settings`). */
export const RESERVED_PROJECT_SLUGS: ReadonlySet<string> = new Set(["settings", "support"]);

export function supportHref(organization: string, path = ""): string {
  return `/${organization}/support${path}`;
}

export function getProduct(key: ProductKey): Product {
  const product = PRODUCTS.find((item) => item.key === key);
  if (!product) throw new Error(`Unknown product: ${key}`);
  return product;
}

export function isProductKey(value: string): value is ProductKey {
  return (PRODUCT_KEYS as readonly string[]).includes(value);
}

/** A member's pinned (`true`) and hidden (`false`) products; the rest show while in use. */
export type ProductPreferences = Partial<Record<ProductKey, boolean>>;

/**
 * The products a member sees, in catalog order: pinned ones and the ones in use (in any environment
 * of the project: see `productUseInProject`) that they haven't hidden. With none, Email, where most
 * start.
 */
export function visibleProducts(
  inUse: readonly ProductKey[],
  preferences: ProductPreferences,
): ProductKey[] {
  const visible = PRODUCT_KEYS.filter((key) => preferences[key] ?? inUse.includes(key));
  if (visible.length > 0 || preferences.email === false) return visible;
  return ["email"];
}

/** One of a project's environments and the products in use in it. */
export type EnvironmentUse = { slug: string; name: string; products: readonly ProductKey[] };

export type ProductUse = {
  /** In use in the current environment. */
  here: readonly ProductKey[];
  /** In use in any of the project's environments. */
  inProject: readonly ProductKey[];
  /** Products not in use here, with the other environments that use them. */
  elsewhere: Partial<Record<ProductKey, EnvironmentUse[]>>;
};

/** Where a project's products are in use, seen from one of its environments. */
export function productUseInProject(
  environments: readonly EnvironmentUse[],
  currentSlug: string,
): ProductUse {
  const here = environments.find((env) => env.slug === currentSlug)?.products ?? [];
  const elsewhere: ProductUse["elsewhere"] = {};
  for (const env of environments) {
    if (env.slug === currentSlug) continue;
    for (const product of env.products) {
      if (!here.includes(product)) elsewhere[product] = [...(elsewhere[product] ?? []), env];
    }
  }
  return {
    here,
    inProject: PRODUCT_KEYS.filter((key) => here.includes(key) || elsewhere[key]),
    elsewhere,
  };
}

/** `In use in Production`, or `In use in 2 other environments`. */
export function inUseElsewhereLabel(environments: readonly EnvironmentUse[]): string {
  const [only] = environments;
  return only && environments.length === 1
    ? `In use in ${only.name}`
    : `In use in ${environments.length} other environments`;
}

/** The product or section a path below an environment belongs to (`/email/domains` → Email). */
export function sectionOf(path: string): Product | DashboardSection | undefined {
  const first = `/${path.split("/")[1] ?? ""}`;
  if (first === DEVELOPERS.path) return DEVELOPERS;
  return PRODUCTS.find((product) => product.path === first);
}

export type EnvironmentSlugs = { organization: string; project: string; environment: string };

export function environmentHref(slugs: EnvironmentSlugs, path = ""): string {
  return `/${slugs.organization}/${slugs.project}/${slugs.environment}${path}`;
}

export function settingsHref(organization: string, path = ""): string {
  return `/${organization}/settings${path}`;
}

/**
 * A page of whichever environment the viewer last used (`/<org>?to=/email/domains`): for links
 * made without one, like notification emails about the organization's domains.
 */
export function orgLinkHref(organization: string, to: string): string {
  return `/${organization}?to=${encodeURIComponent(to)}`;
}

/** `to` of `orgLinkHref` when it is a plain path below an environment (with a query), else `null`. */
export function parseOrgLink(to: string | null | undefined): string | null {
  if (!to) return null;
  const [path = "", ...query] = to.split("?");
  if (!/^(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)+$/.test(path)) return null;
  if (path.split("/").some((segment) => segment === "." || segment === "..")) return null;
  const search = query.join("?");
  if (/[\s#\\]/.test(search)) return null;
  return search ? `${path}?${search}` : path;
}
