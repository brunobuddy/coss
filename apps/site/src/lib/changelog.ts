import { SITE_URL } from "./site";

/**
 * What shipped, newest first: /changelog, its RSS feed and `.md` twin. Only what customers can use
 * in production today.
 */

export interface ChangelogEntry {
  /** YYYY-MM-DD. */
  date: string;
  title: string;
  body: string;
  href: string;
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-11-04",
    title: "Your own OAuth apps for Scheduling",
    body: "Connect hosts' calendars through your own Google, Microsoft or Zoom app, so the consent screen shows your brand instead of ours.",
    href: "/docs/scheduling/oauth-apps",
  },
  {
    date: "2026-11-03",
    title: "Scheduling",
    body: "Let your users be booked: hosts, weekly hours, Google, Microsoft and CalDAV calendars, and bookings with double-booking prevented by the database. Hosted pages are served at cossbook.com, with your branding on emails.",
    href: "/products/scheduling",
  },
  {
    date: "2026-11-03",
    title: "Support from the dashboard",
    body: "Email support@coss.com or raise a ticket in the dashboard, with response targets per plan.",
    href: "/pricing",
  },
  {
    date: "2026-10-30",
    title: "Forms",
    body: "Hosted form endpoints for your site. Every submission is screened for spam, and accepted ones go to webhooks, notification emails and contacts.",
    href: "/products/forms",
  },
  {
    date: "2026-10-30",
    title: "Verify",
    body: "One-time codes by SMS or email, with a fraud guard that stops SMS pumping before anything is sent.",
    href: "/products/verify",
  },
  {
    date: "2026-10-30",
    title: "Email for platforms",
    body: "Sub-accounts give each of your users their own domains, suppressions, quotas and reputation.",
    href: "/products/subaccounts",
  },
  {
    date: "2026-10-30",
    title: "Log drain presets",
    body: "Send logs straight to Loki, Datadog or an OTLP collector, with an encrypted auth header.",
    href: "/docs/log-drains",
  },
  {
    date: "2026-10-29",
    title: "Inboxes for AI agents",
    body: "Give an agent its own email address, with received mail kept as threads and replies that thread in every mail client.",
    href: "/products/inboxes",
  },
  {
    date: "2026-10-29",
    title: "Phone checks in Risk",
    body: "coss.risk.checkPhone() reports whether a number exists, its line type and its carrier.",
    href: "/products/risk",
  },
  {
    date: "2026-10-21",
    title: "SDKs for six more languages",
    body: "Python, Go, Ruby, PHP, Java and .NET SDKs, generated from the OpenAPI document.",
    href: "/products/sdks",
  },
  {
    date: "2026-10-19",
    title: "SMS",
    body: "Send and receive text messages on the same key as email, with US carrier registration handled from one form.",
    href: "/products/sms",
  },
  {
    date: "2026-10-19",
    title: "Import from Resend, SendGrid and Postmark",
    body: "Bring your domains, templates, contacts, suppressions and webhooks over from the dashboard.",
    href: "/docs/migrate",
  },
  {
    date: "2026-10-16",
    title: "Marketing email",
    body: "Contacts, audiences, segments, topics and broadcasts, in a stream of their own so complaints never hold up password resets.",
    href: "/products/marketing-email",
  },
  {
    date: "2026-10-16",
    title: "DMARC reports and dedicated IPs",
    body: "Aggregate reports that guide a domain from p=none to reject, and dedicated IP pools as a paid add-on.",
    href: "/docs/email/dmarc",
  },
  {
    date: "2026-10-16",
    title: "Integrations for Nodemailer, Better Auth and Auth.js",
    body: "Send what your app already sends through coss.com without rewriting it.",
    href: "/docs/integrations",
  },
  {
    date: "2026-10-15",
    title: "SMTP relay and MCP server",
    body: "smtp.coss.com for apps that can't call an API, and coss-mcp for coding agents.",
    href: "/products/smtp",
  },
  {
    date: "2026-10-15",
    title: "Risk building blocks and rate limiting",
    body: "Email and IP checks, content classification, device tokens, and a hosted rate limiter for your own endpoints.",
    href: "/products/rate-limiting",
  },
  {
    date: "2026-10-14",
    title: "Risk",
    body: "Allow, review or block sign-ups, logins and other events, with the reasons why.",
    href: "/products/risk",
  },
  {
    date: "2026-10-14",
    title: "The coss SDK on npm, and sign-in with Google and GitHub",
    body: "npm install coss, and a faster way into the dashboard.",
    href: "/docs/sdk",
  },
  {
    date: "2026-10-12",
    title: "Plans and pricing",
    body: "A free plan, paid plans whose monthly fee becomes usage credit, and a public billing API.",
    href: "/pricing",
  },
  {
    date: "2026-10-11",
    title: "Logs, log drains and directory sync",
    body: "Environment logs and an organization audit log, streamed to your own endpoints, plus SCIM for your members.",
    href: "/products/platform",
  },
  {
    date: "2026-10-11",
    title: "Batch sends and dated API versions",
    body: "Send up to 100 emails in one request, and upgrade API versions when you choose.",
    href: "/docs/api-reference/versioning",
  },
];

export const CHANGELOG_ROUTE = "/changelog";

/** /changelog/index.md. */
export function changelogMarkdown(): string {
  const entries = CHANGELOG.map(
    (entry) => `## ${entry.title} (${entry.date})\n\n${entry.body}\n\n${SITE_URL}${entry.href}`,
  );
  return `# coss.com changelog (${SITE_URL}${CHANGELOG_ROUTE})\n\nWhat shipped, newest first. Every API version's breaking changes: ${SITE_URL}/docs/api-reference/changelog\n\n${entries.join("\n\n")}\n`;
}

const escapeXml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** /changelog/rss.xml. */
export function changelogRss(): string {
  const items = CHANGELOG.map(
    (entry) => `    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${SITE_URL}${entry.href}</link>
      <guid isPermaLink="false">${entry.date}-${escapeXml(entry.title)}</guid>
      <pubDate>${new Date(`${entry.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeXml(entry.body)}</description>
    </item>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>coss.com changelog</title>
    <link>${SITE_URL}${CHANGELOG_ROUTE}</link>
    <description>What shipped on coss.com, newest first.</description>
${items.join("\n")}
  </channel>
</rss>
`;
}
