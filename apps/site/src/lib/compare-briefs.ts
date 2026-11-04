/**
 * The comparison table's text where a cell's full text is long: each written by hand from that
 * cell, saying less and nothing else. The full text stays in the page's `.md` twin, with its
 * sources. `test/marketing.test.ts` checks every long cell has one and that a brief's figures all
 * come from its cell. Cells holding catalog prices take them from the cell, so they can't go stale.
 */

/** Longer than this, a cell needs a brief. */
export const BRIEF_ABOVE = 130;

const firstClause = (full: string) => full.split(";")[0] ?? full;

const BRIEFS: readonly (readonly [string, string | ((full: string) => string)])[] = [
  // coss.com
  [
    "Per recipient, with no volume tiers to pick",
    (full) => {
      const from = /: (\$[\d.]+ per [\d,]+ recipients)/.exec(full)?.[1];
      const plans = /Paid plans start at (\$[\d,]+\/month)/.exec(full)?.[1];
      return `${from}, lower at volume in graduated bands; paid plans from ${plans}`;
    },
  ],
  [
    "Contacts with custom properties",
    "Contacts, audiences, segments, topics, double opt-in and broadcasts on their own stream",
  ],
  [
    "Every environment has its own address",
    "An address per environment, or your domain with an MX record; a webhook, then the API",
  ],
  [
    "Sub-accounts on Scale and Enterprise",
    "Sub-accounts on Scale and Enterprise, each with its own domains, reputation and quotas",
  ],
  [
    "TypeScript, plus generated SDKs",
    "TypeScript, Python, Go, Ruby, PHP, Java and .NET; Laravel, Rails and Django drivers; a CLI and MCP server",
  ],
  [
    "Every API request, email event and webhook attempt",
    "Every request, event and webhook attempt, searchable and exportable; log drains on Scale and Enterprise",
  ],
  [
    "Free plan:",
    (full) =>
      full.includes("Sandbox")
        ? `${firstClause(full)}; sandbox keys, and nothing leaves coss.com`
        : firstClause(full),
  ],
  ["SMS (US):", (full) => `${firstClause(full)}; other countries on coss.com/pricing`],
  [
    "Assessments $",
    (full) => {
      const from = /^Assessments (\$[\d.]+ per [\d,]+ assessments)/.exec(full)?.[1];
      return `${from}, lower at volume; blocked decisions free; phone checks and classify on their own priced apart`;
    },
  ],
  [
    "10,000 risk assessments",
    (full) => `${firstClause(full)}; past that, assessments go on without velocity or memory`,
  ],
  ["Per inbox:", (full) => `${firstClause(full)}, lower beyond that`],
  [
    "Fraud guard before sending",
    "Fraud guard before sending: Risk lists, number types, Tor, and velocity by IP, user and prefix",
  ],
  [
    "checkout events:",
    "checkout events with amount, card country and funding; card fingerprints as keyed hashes",
  ],
  [
    "Disposable and undeliverable domains",
    "Disposable domains, typos, duplicate mailboxes; Tor, cloud networks, ASN and country",
  ],
  // Others: facts as checked on their pages, shortened.
  [
    "Monthly plans by email volume",
    "Monthly plans by email volume, from $20/month; marketing priced by contacts, from $40/month",
  ],
  [
    "Any address at a Resend-managed",
    "A .resend.app address, or your domain with an MX record; a webhook, then its receiving API",
  ],
  [
    "Its multi-tenant guide offers",
    "Domain-scoped API keys in one account, or a separate Resend account per tenant",
  ],
  [
    "Email API plans by volume",
    "Email API plans by volume, from $19.95/month; Marketing Campaigns separately, from $15/month",
  ],
  [
    "Subusers on Pro, Premier",
    "Subusers on Pro, Premier and Advanced Marketing Campaigns: up to 15, more through support",
  ],
  [
    "Basic from $15/month",
    "Plans from $15/month for 10,000 emails to $90/month for 100,000, plus extra emails per 1,000",
  ],
  [
    "$0.10 per 1,000 emails plus $0.12",
    "$0.10 per 1,000 emails plus attachment data, or fixed monthly plans per region",
  ],
  [
    "New accounts start in a sandbox",
    "A sandbox per region, verified recipients only, until production access is granted",
  ],
  [
    "Tenants with their own identities",
    "Tenants with their own identities and reputation policies; up to 10,000 per account by default",
  ],
  [
    "Plans by monthly email volume: Starter",
    "Plans by monthly email volume, from $9/month for 5,000 emails to $499/month for 150,000",
  ],
  [
    "Drag-and-drop editor, segmentation",
    "Editor, segmentation and forms on Starter; automation, A/B tests and landing pages from Standard",
  ],
  [
    "Inbound parsing: MX records",
    "MX records on a receiving subdomain; each message posted to your URL as JSON",
  ],
  [
    "Hobby $7/month",
    "Hobby $7/month for 5,000 emails; Starter from $35/month and Professional from $110/month for 50,000",
  ],
  [
    "Email API and SMTP relay; drag-and-drop",
    "Email API and SMTP relay; visual and HTML builders, dynamic templates and split testing",
  ],
  [
    "Inbound routes on every plan",
    "Inbound routes on every plan; messages parsed to JSON, posted to a webhook or forwarded",
  ],
  [
    "US and Canada only, transactional only",
    "US and Canada, transactional only; from 100 messages a month on Starter, then $1.40 per 100",
  ],
  [
    "HMAC-SHA256 of the body in a Signature header",
    "HMAC-SHA256 signature; retries for about 3 days; 1 to unlimited webhooks by plan",
  ],
  [
    "By subscribed contacts",
    "By subscribed contacts, from $49/month for up to 5,000, with unlimited sends",
  ],
  [
    "Workflows started by a new contact",
    "Workflows from contact changes or your own events, with timers, branches and filters",
  ],
  [
    "Webhook-Id, Webhook-Timestamp and Webhook-Signature headers (HMAC",
    "Signed headers (HMAC-SHA256); 8 attempts over about 28 hours; disabled after 5 days of failures",
  ],
  [
    "Through sales, with a minimum monthly commitment",
    "Through sales, with a minimum monthly commitment from USD 1,000",
  ],
  [
    "$0.0077 per SMS on long and short codes",
    "$0.0077 per SMS on long and short codes, $0.0079 on toll-free, plus carrier surcharges",
  ],
  [
    "Verify by SMS, voice or WhatsApp",
    "SMS, voice or WhatsApp; no fee per verification, channel prices by country; through sales",
  ],
  [
    "Email, Slack, Discord and more on Free",
    "Email and chat apps on Free; Sheets and Notion from Personal; webhooks and HubSpot from Professional",
  ],
  [
    "No per-booking price. Per connected account",
    "Per connected account: Essentials $15 a month, Pro $49 a month; no per-booking price",
  ],
];

/** A cell as the page's table shows it: plain text (backticks are for the Markdown twin). */
export function briefCell(text: string): string {
  const plain = text.replaceAll("`", "");
  if (plain.length <= BRIEF_ABOVE) return plain;
  const brief = BRIEFS.find(([prefix]) => plain.startsWith(prefix))?.[1];
  if (!brief) return plain;
  return typeof brief === "string" ? brief : brief(plain);
}
