import {
  ApiIcon,
  BookOpen02Icon,
  CommandLineIcon,
  File01Icon,
  GitBranchIcon,
  LicenseIcon,
  McpServerIcon,
  Plug01Icon,
  Robot01Icon,
  RocketIcon,
  SourceCodeIcon,
  TextIcon,
} from "@hugeicons/core-free-icons";
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

type Icon = typeof RocketIcon;

export interface MenuLink {
  label: string;
  description: string;
  icon: Icon;
  href: string;
}

export interface MenuColumn {
  title: string;
  links: readonly MenuLink[];
}

/** A product in the header: its tile comes from `PRODUCT_VISUALS`, by slug. */
export interface ProductLink {
  slug: string;
  label: string;
  description: string;
  href: string;
  badge?: "New";
  /** What builds on this product, listed under it. */
  items?: readonly ProductLink[];
}

/** The name of an API product of `coss`, from `PRODUCTS`. */
function apiName(key: (typeof PRODUCTS)[number]["key"]): string {
  return PRODUCTS.find((p) => p.key === key)?.name ?? key;
}

function product(
  slug: string,
  label: string,
  description: string,
  badge?: ProductLink["badge"],
): ProductLink {
  return { slug, label, description, href: `/products/${slug}`, badge };
}

/**
 * Every product, with no families to guess between, and the rest of email under Email. The menu
 * reads down its columns, in the home page's order.
 */
export const PRODUCT_LINKS: readonly ProductLink[] = [
  {
    ...product("email", apiName("email"), "Transactional email from your own domains."),
    items: [
      product("marketing-email", "Marketing email", "Contacts, segments and broadcasts."),
      product("inbound-email", "Inbound email", "Receive mail on your domains."),
      product("subaccounts", "Email for platforms", "Sub-accounts for your customers.", "New"),
      product("smtp", "SMTP relay", "Send from any app that speaks SMTP."),
    ],
  },
  product("sms", apiName("sms"), "Text messages, US and Canada first."),
  product("scheduling", apiName("scheduling"), "Bookings and calendars in your app.", "New"),
  product("risk", "Risk", "Abuse checks for sign-ups and payments."),
  product("verify", "Verify", "One-time codes by SMS or email.", "New"),
  product("sign", "Sign", "E-signatures in your app.", "New"),
  product("inboxes", "Inboxes", "Email addresses for AI agents.", "New"),
  product("forms", "Forms", "Form endpoints and hosted forms.", "New"),
  product("hooks", "Hooks", "Webhooks you send to your customers."),
  product("rate-limiting", "Rate limiting", "Limits for your own endpoints."),
];

/** Every product in the menu, sub-items too. */
export const ALL_PRODUCT_LINKS: readonly ProductLink[] = PRODUCT_LINKS.flatMap((link) => [
  link,
  ...(link.items ?? []),
]);

/** What every product shares, and the ways in that aren't a product: plain links under the list. */
export const PLATFORM_LINKS: readonly { label: string; href: string }[] = [
  { label: "Platform", href: "/products/platform" },
  { label: "Security", href: "/products/security" },
  { label: "Logs and drains", href: `${DOCS_ROUTE}/logs` },
  { label: "Domains", href: `${DOCS_ROUTE}/email/domains` },
  { label: "Solutions", href: "/solutions" },
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
      ["In-app booking", "/solutions/booking"],
      ["Phone verification", "/solutions/phone-verification"],
      ["Contact forms", "/solutions/contact-forms"],
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
      ["vs Twilio Verify", "/compare/twilio-verify"],
      ["vs Svix", "/compare/svix"],
      ["vs AgentMail", "/compare/agentmail"],
      ["vs DocuSign", "/compare/docusign"],
      ["vs Formspree", "/compare/formspree"],
      ["vs Brevo", "/compare/brevo"],
      ["vs MailerSend", "/compare/mailersend"],
      ["vs Loops", "/compare/loops"],
      ["vs Plivo", "/compare/plivo"],
      ["vs Nylas Scheduler", "/compare/nylas-scheduler"],
      ["vs Castle", "/compare/castle"],
      ["vs Unkey", "/compare/unkey"],
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
      ["Free tools", "/products/tools"],
    ],
  },
  {
    title: "Company",
    links: [
      ["Pricing", "/pricing"],
      ["About", "/about"],
      ["Changelog", "/changelog"],
      ["Platform", "/products/platform"],
      ["Security", "/products/security"],
      ["Status", "/status"],
      ["Contact", "/contact"],
      ["GitHub", "https://github.com/cosscom/coss"],
      ["X", "https://x.com/coss_com"],
      ["LinkedIn", "https://www.linkedin.com/company/cosscom"],
    ],
  },
  {
    title: "More from coss.com",
    links: [
      ["Shipyard", "/shipyard"],
      ["kloq", "/kloq"],
      ["coss ui", "/ui"],
      ["Origin UI", "/origin"],
      ["qnot", "/qnot"],
    ],
  },
];
