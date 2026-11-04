import {
  type DashboardPage,
  type DashboardSection,
  DEVELOPERS,
  environmentHref,
  ORGANIZATION_SETTINGS,
  PRODUCTS,
  type ProductKey,
} from "@coss/dashboard-routes";
import {
  BotIcon,
  BuildingIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  CodeXmlIcon,
  CreditCardIcon,
  GaugeIcon,
  GlobeIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  type LucideIcon,
  MailIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  MonitorSmartphoneIcon,
  RocketIcon,
  ScanSearchIcon,
  SendIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SignatureIcon,
  UserIcon,
  UserPlusIcon,
  WalletIcon,
  WaypointsIcon,
} from "lucide-react";

/**
 * The dashboard's navigation. Products, their pages and the organization's settings come from
 * `@coss/dashboard-routes`; this adds their icons and keeps the account and admin areas' lists.
 */
export type NavItem = {
  label: string;
  /** Relative to the area's base path; `""` is the base itself. */
  path: string;
  icon?: LucideIcon;
  /** Active only on the exact path (overview pages), not on its children. */
  exact?: boolean;
};

export const PRODUCT_ICONS: Record<ProductKey, LucideIcon> = {
  email: MailIcon,
  marketing: MegaphoneIcon,
  inboxes: BotIcon,
  sms: MessageSquareIcon,
  verify: ShieldCheckIcon,
  sign: SignatureIcon,
  forms: ClipboardListIcon,
  scheduling: CalendarClockIcon,
  hooks: WaypointsIcon,
  risk: ShieldAlertIcon,
};

export const DEVELOPERS_ICON = CodeXmlIcon;
export const ORGANIZATION_ICON = BuildingIcon;

function pageItem(page: DashboardPage): NavItem {
  return { label: page.label, path: page.path, exact: page.exact };
}

/** A section's pages (a product, Developers) as nav items, relative to the environment base. */
export function sectionNav(section: DashboardSection): NavItem[] {
  return section.pages.map(pageItem);
}

/** Every page below an environment, by section: the ⌘K menu lists them. */
export const ENVIRONMENT_PAGES: { section: string; icon: LucideIcon; items: NavItem[] }[] = [
  ...PRODUCTS.map((product) => ({
    section: product.name,
    icon: PRODUCT_ICONS[product.key],
    items: sectionNav(product),
  })),
  { section: DEVELOPERS.name, icon: DEVELOPERS_ICON, items: sectionNav(DEVELOPERS) },
];

/** The organization's settings (under `/acme/settings`). */
export const ORGANIZATION_SETTINGS_NAV: NavItem[] = ORGANIZATION_SETTINGS.map(pageItem);

/** The tabs of an organization's spend (under `/acme/settings/spend`). */
export const SPEND_NAV: NavItem[] = [
  { label: "Overview", path: "", icon: WalletIcon, exact: true },
  { label: "Budgets", path: "/budgets", icon: GaugeIcon },
];

/** The tabs of a domain (under `…/email/domains/dom_…`). */
export const DOMAIN_NAV: NavItem[] = [
  { label: "Overview", path: "", icon: GlobeIcon, exact: true },
  { label: "DMARC", path: "/dmarc", icon: ShieldIcon },
];

/** Account settings (under `/settings`). */
export const ACCOUNT_NAV: NavItem[] = [
  { label: "Profile", path: "", icon: UserIcon, exact: true },
  { label: "Security", path: "/security", icon: ShieldIcon },
  { label: "Sessions", path: "/sessions", icon: MonitorSmartphoneIcon },
];

/** The platform admin console (under `/admin`). */
export const ADMIN_NAV: NavItem[] = [
  { label: "Overview", path: "", icon: LayoutDashboardIcon, exact: true },
  { label: "Support", path: "/support", icon: LifeBuoyIcon },
  { label: "Users", path: "/users", icon: UserIcon },
  { label: "Organizations", path: "/organizations", icon: BuildingIcon },
  { label: "Sign-ups", path: "/signups", icon: UserPlusIcon },
  { label: "Sending", path: "/sending", icon: SendIcon },
  { label: "Emails", path: "/emails", icon: MailIcon },
  { label: "SMS", path: "/sms", icon: MessageSquareIcon },
  { label: "Screening", path: "/screening", icon: ScanSearchIcon },
  { label: "Forms", path: "/forms", icon: ClipboardListIcon },
  { label: "Audit log", path: "/audit", icon: HistoryIcon },
  { label: "Reputation", path: "/reputation", icon: GaugeIcon },
  { label: "Billing", path: "/billing", icon: CreditCardIcon },
  { label: "Deploys", path: "/deploys", icon: RocketIcon },
  { label: "Security", path: "/security", icon: ShieldIcon },
];

/**
 * The current page among `items` (under `base`): the one whose href is the longest prefix of
 * `pathname`, so `/risk/lists` picks "Lists" and `/risk/rsk_…` picks "Assessments".
 */
export function activeNavItem<T extends { path: string; exact?: boolean }>(
  pathname: string,
  base: string,
  items: readonly T[],
): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    const href = base + item.path;
    const matches = pathname === href || (!item.exact && pathname.startsWith(`${href}/`));
    if (matches && (!best || item.path.length > best.path.length)) best = item;
  }
  return best;
}

/** The base path of a project's environment. */
export function environmentPath(orgSlug: string, projectSlug: string, envSlug: string): string {
  return environmentHref({ organization: orgSlug, project: projectSlug, environment: envSlug });
}

/**
 * The label of a static path segment in breadcrumbs (`api-keys` → "API keys"). Dynamic segments
 * (ids, slugs) have none and are named by the caller.
 */
export function segmentLabel(segment: string): string | undefined {
  if (segment.startsWith("ticket_")) return "Ticket";
  return SEGMENT_LABELS[segment];
}

const SEGMENT_LABELS: Record<string, string> = {
  "out-of-office": "Out of office",
  reassignments: "Reassignments",
  email: "Email",
  support: "Support",
  "saved-replies": "Saved replies",
  intake: "Unfiled mail",
  messages: "Emails",
  storage: "Content storage",
  numbers: "Phone numbers",
  developers: "Developers",
  products: "All products",
  projects: "Projects",
  emails: "Emails",
  sms: "SMS",
  forms: "Forms",
  scheduling: "Scheduling",
  hosts: "Hosts",
  builder: "Fields and page",
  submissions: "Submissions",
  sign: "Sign",
  verify: "Verify",
  register: "Register",
  templates: "Templates",
  versions: "Versions",
  hooks: "Hooks",
  "event-types": "Event types",
  endpoints: "Endpoints",
  received: "Received",
  inboxes: "Inboxes",
  suppressions: "Suppressions",
  subaccounts: "Sub-accounts",
  contacts: "Contacts",
  properties: "Properties",
  audiences: "Audiences",
  segments: "Segments",
  new: "New",
  topics: "Topics",
  marketing: "Marketing",
  tracking: "Tracking",
  risk: "Risk",
  lists: "Lists",
  rules: "Rules",
  limits: "Rate limits",
  calibration: "Calibration",
  "api-keys": "API keys",
  webhooks: "Webhooks",
  logs: "Logs",
  "log-drains": "Log drains",
  import: "Import",
  domains: "Domains",
  dmarc: "DMARC",
  "dedicated-ips": "Dedicated IPs",
  members: "Members",
  reputation: "Reputation",
  spend: "Spend",
  budgets: "Budgets",
  settings: "Settings",
  billing: "Billing",
  plans: "Plans",
  invoices: "Invoices",
  sso: "Single sign-on",
  scim: "Directory sync",
  audit: "Audit log",
  compliance: "Compliance",
  security: "Security",
  sessions: "Sessions",
  users: "Users",
  organizations: "Organizations",
  signups: "Sign-ups",
  sending: "Sending",
  screening: "Screening",
  deploys: "Deploys",
};
