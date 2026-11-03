import {
  ApiIcon,
  BookOpen02Icon,
  Building03Icon,
  Calendar03Icon,
  CalendarCheckIn01Icon,
  ClipboardPenLineIcon,
  CommandLineIcon,
  DashboardSpeed01Icon,
  DashboardSquare01Icon,
  File01Icon,
  FilterIcon,
  GitBranchIcon,
  Globe02Icon,
  InboxDownloadIcon,
  InboxIcon,
  Layers01Icon,
  LicenseIcon,
  Mail01Icon,
  McpServerIcon,
  Megaphone01Icon,
  Message01Icon,
  Notification03Icon,
  PasswordValidationIcon,
  Plug01Icon,
  Robot01Icon,
  RocketIcon,
  SecurityCheckIcon,
  ServerStack01Icon,
  Shield01Icon,
  ShipIcon,
  SignatureIcon,
  SourceCodeIcon,
  TextIcon,
  Video01Icon,
  WebhookIcon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import { CALENDAR } from "./calendar";
import { SHIPYARD } from "./shipyard";
import { DOCS_ROUTE, PRODUCTS } from "./site";

/*
 * The header's menus. Every product coss.com ships is one entry here: the desktop mega menu
 * and the mobile drawer both render these lists, so a new product needs nothing else in the header.
 */

/** The element the mega menu's panels hang from: the page's sheet, flush under the header. */
export const HEADER_BAR_ID = "site-header-bar";
/**
 * The shell the panels render into (not `<body>`): inside its stacking context, so the shell's
 * rails and corner marks stay drawn over an open panel.
 */
export const SITE_SHELL_ID = "site-shell";
/**
 * The docs sidebar's width (coss ui's default). On docs pages the header's wordmark cell takes it
 * too, so the hairline after the wordmark continues the sidebar's edge.
 */
export const DOCS_SIDEBAR_WIDTH = "16rem";

type Icon = typeof Mail01Icon;

export interface MenuLink {
  label: string;
  description: string;
  icon: Icon;
  href: string;
  badge?: "New";
  /** Served by another app of coss.com (a plain link rather than `next/link`). */
  zone?: boolean;
}

export interface MenuColumn {
  title: string;
  links: readonly MenuLink[];
}

/** An API product of `coss`, named from `PRODUCTS`. */
function api(key: (typeof PRODUCTS)[number]["key"], link: Omit<MenuLink, "label">): MenuLink {
  return { ...link, label: PRODUCTS.find((p) => p.key === key)?.name ?? key };
}

export const PRODUCT_COLUMNS: readonly MenuColumn[] = [
  {
    title: "Email",
    links: [
      api("email", {
        description: "Transactional email from your own domains.",
        icon: Mail01Icon,
        href: "/products/email",
      }),
      {
        label: "Marketing email",
        description: "Contacts, segments and broadcasts.",
        icon: Megaphone01Icon,
        href: "/products/marketing-email",
      },
      {
        label: "Inboxes",
        description: "Email addresses for AI agents.",
        icon: InboxIcon,
        href: "/products/inboxes",
        badge: "New",
      },
      {
        label: "Inbound email",
        description: "Receive mail on your domains.",
        icon: InboxDownloadIcon,
        href: "/products/inbound-email",
      },
      {
        label: "Email for platforms",
        description: "Sub-accounts for your customers.",
        icon: Building03Icon,
        href: "/products/subaccounts",
        badge: "New",
      },
      {
        label: "SMTP relay",
        description: "Send from any app that speaks SMTP.",
        icon: ServerStack01Icon,
        href: "/products/smtp",
      },
    ],
  },
  {
    title: "Messaging and identity",
    links: [
      api("sms", {
        description: "Text messages worldwide.",
        icon: Message01Icon,
        href: "/products/sms",
      }),
      {
        label: "Verify",
        description: "One-time codes by SMS or email.",
        icon: PasswordValidationIcon,
        href: "/products/verify",
        badge: "New",
      },
      {
        label: "Sign",
        description: "E-signatures in your app.",
        icon: SignatureIcon,
        href: "/products/sign",
        badge: "New",
      },
      {
        label: "Forms",
        description: "Form endpoints and hosted forms.",
        icon: ClipboardPenLineIcon,
        href: "/products/forms",
        badge: "New",
      },
      api("scheduling", {
        description: "Bookings and calendars in your app.",
        icon: CalendarCheckIn01Icon,
        href: "/products/scheduling",
        badge: "New",
      }),
      api("video", { description: "Rooms and recordings.", icon: Video01Icon, href: "/#video" }),
    ],
  },
  {
    title: "Events and trust",
    links: [
      {
        label: "Hooks",
        description: "Webhooks you send to your customers.",
        icon: WebhookIcon,
        href: "/products/hooks",
      },
      {
        label: "Risk",
        description: "Abuse checks for sign-ups and payments.",
        icon: Shield01Icon,
        href: "/products/risk",
      },
      {
        label: "Rate limiting",
        description: "Limits for your own endpoints.",
        icon: DashboardSpeed01Icon,
        href: "/products/rate-limiting",
      },
    ],
  },
  {
    title: "Platform",
    links: [
      {
        label: "Platform",
        description: "Webhooks, logs, keys and billing.",
        icon: Layers01Icon,
        href: "/products/platform",
      },
      {
        label: "Security",
        description: "SSO, SCIM, audit log, reputation.",
        icon: SecurityCheckIcon,
        href: "/products/security",
      },
      {
        label: "Logs and drains",
        description: "Every request and event.",
        icon: WorkHistoryIcon,
        href: `${DOCS_ROUTE}/logs`,
      },
      {
        label: "Domains",
        description: "Verified sending domains.",
        icon: Globe02Icon,
        href: `${DOCS_ROUTE}/email/domains`,
      },
      {
        label: "Solutions",
        description: "Agents, platforms, sign-ups.",
        icon: Notification03Icon,
        href: "/solutions",
      },
    ],
  },
  {
    title: "More from coss.com",
    links: [
      {
        label: CALENDAR.name,
        description: "A React calendar component.",
        icon: Calendar03Icon,
        href: CALENDAR.path,
        badge: "New",
      },
      {
        label: "coss.com ui",
        description: "React components built on Base UI.",
        icon: DashboardSquare01Icon,
        href: "/ui",
        zone: true,
      },
      {
        label: SHIPYARD.name,
        description: "Coding agents on your own dev boxes.",
        icon: ShipIcon,
        href: SHIPYARD.path,
        badge: "New",
      },
      {
        label: "qnot",
        description: "A typed query builder for any framework.",
        icon: FilterIcon,
        href: "/qnot",
        badge: "New",
        zone: true,
      },
    ],
  },
];

export const DEVELOPER_COLUMNS: readonly MenuColumn[] = [
  {
    title: "Get started",
    links: [
      {
        label: "Quickstart",
        description: "Send your first email.",
        icon: RocketIcon,
        href: `${DOCS_ROUTE}/quickstart`,
      },
      {
        label: "Documentation",
        description: "Guides for every product.",
        icon: BookOpen02Icon,
        href: DOCS_ROUTE,
      },
      {
        label: "SDKs",
        description: "TypeScript, Python, Go, Ruby, PHP, Java, .NET.",
        icon: SourceCodeIcon,
        href: "/products/sdks",
      },
      {
        label: "API reference",
        description: "Every endpoint, with examples.",
        icon: ApiIcon,
        href: `${DOCS_ROUTE}/api-reference`,
      },
    ],
  },
  {
    title: "Reference",
    links: [
      {
        label: "Errors",
        description: "Types, codes and retries.",
        icon: LicenseIcon,
        href: `${DOCS_ROUTE}/api-reference/errors`,
      },
      {
        label: "Versioning",
        description: "Dated API versions.",
        icon: GitBranchIcon,
        href: `${DOCS_ROUTE}/api-reference/versioning`,
      },
      {
        label: "Changelog",
        description: "What changed, by version.",
        icon: File01Icon,
        href: `${DOCS_ROUTE}/api-reference/changelog`,
      },
      {
        label: "Compare",
        description: "coss.com next to the alternatives.",
        icon: Plug01Icon,
        href: "/compare",
      },
    ],
  },
  {
    title: "For agents",
    links: [
      {
        label: "Agent setup",
        description: "One prompt that sets coss.com up.",
        icon: Robot01Icon,
        href: "/products/agents",
      },
      {
        label: "CLI",
        description: "Webhooks on localhost, from your terminal.",
        icon: CommandLineIcon,
        href: `${DOCS_ROUTE}/cli`,
      },
      {
        label: "MCP server",
        description: "Let your coding agent check delivery.",
        icon: McpServerIcon,
        href: `${DOCS_ROUTE}/mcp`,
      },
      {
        label: "llms.txt",
        description: "Every docs page, indexed.",
        icon: TextIcon,
        href: "/llms.txt",
      },
      {
        label: "llms-full.txt",
        description: "The whole manual in one file.",
        icon: CommandLineIcon,
        href: "/llms-full.txt",
      },
    ],
  },
];

/** The site footer's link columns (`SiteFooter`); every link is checked by test/marketing.test.ts. */
export const FOOTER_COLUMNS: readonly { title: string; links: readonly [string, string][] }[] = [
  {
    title: "Products",
    links: [
      ["Email", "/products/email"],
      ["Marketing email", "/products/marketing-email"],
      ["Inboxes for agents", "/products/inboxes"],
      ["Inbound email", "/products/inbound-email"],
      ["Email for platforms", "/products/subaccounts"],
      ["SMTP relay", "/products/smtp"],
      ["SMS", "/products/sms"],
      ["Verify", "/products/verify"],
      ["Sign", "/products/sign"],
      ["Forms", "/products/forms"],
      ["Scheduling", "/products/scheduling"],
      ["Hooks", "/products/hooks"],
      ["Risk", "/products/risk"],
      ["Rate limiting", "/products/rate-limiting"],
      ["All products", "/products"],
    ],
  },
  {
    title: "Solutions",
    links: [
      ["AI agents", "/solutions/ai-agents"],
      ["Platforms", "/solutions/platforms"],
      ["Authentication", "/solutions/authentication"],
      ["Notifications", "/solutions/notifications"],
      ["All solutions", "/solutions"],
    ],
  },
  {
    title: "Compare",
    links: [
      ["vs Resend", "/compare/resend"],
      ["vs SendGrid", "/compare/sendgrid"],
      ["vs Postmark", "/compare/postmark"],
      ["vs Mailgun", "/compare/mailgun"],
      ["vs Amazon SES", "/compare/amazon-ses"],
      ["vs Twilio", "/compare/twilio"],
      ["vs Svix", "/compare/svix"],
      ["All comparisons", "/compare"],
    ],
  },
  {
    title: "Developers",
    links: [
      ["Docs", DOCS_ROUTE],
      ["Quickstart", `${DOCS_ROUTE}/quickstart`],
      ["API reference", `${DOCS_ROUTE}/api-reference`],
      ["SDKs", "/products/sdks"],
      ["For coding agents", "/products/agents"],
      ["CLI", `${DOCS_ROUTE}/cli`],
      ["MCP server", `${DOCS_ROUTE}/mcp`],
      ["llms.txt", "/llms.txt"],
    ],
  },
  {
    title: "Company",
    links: [
      ["Pricing", "/pricing"],
      ["About", "/about"],
      ["Platform", "/products/platform"],
      ["Security", "/products/security"],
    ],
  },
];
