/** The free tools at /products/tools. Each runs only in the browser: nothing is sent anywhere. */

export const TOOLS_ROUTE = "/products/tools";

export interface FreeTool {
  slug: string;
  name: string;
  /** The page's `<title>`: what people search for. */
  title: string;
  description: string;
  lede: string;
  /** The guide that explains what the tool checks. */
  docs: { label: string; href: string };
  /** The product it comes from. */
  product: { label: string; href: string };
}

export const FREE_TOOLS: readonly FreeTool[] = [
  {
    slug: "sms-segment-calculator",
    name: "SMS segment calculator",
    title: "SMS segment calculator: GSM-7 and UCS-2 · coss.com",
    description:
      "Paste a text message and see how many segments it takes, which encoding it needs and which characters force UCS-2. Runs in your browser.",
    lede: "Carriers bill by the segment, not the message, and one emoji can drop a segment from 160 characters to 70. Paste a message to see what it costs in segments. This is the code coss.com bills with.",
    docs: { label: "Sending SMS", href: "/docs/sms/sending" },
    product: { label: "coss.com SMS", href: "/products/sms" },
  },
  {
    slug: "webhook-signature-verifier",
    name: "Webhook signature verifier",
    title: "Webhook signature verifier: Standard Webhooks · coss.com",
    description:
      "Check a webhook's signature against its secret and find out why it fails. For Standard Webhooks requests, including coss.com's. Runs in your browser.",
    lede: "A failed webhook signature is usually a re-serialized body or the wrong secret. Paste a request to check it with the same steps as the SDK's verifyWebhook. Nothing you paste leaves this page, but use a test secret anyway.",
    docs: { label: "Verifying webhooks", href: "/docs/sdk/webhooks" },
    product: { label: "coss.com Hooks", href: "/products/hooks" },
  },
  {
    slug: "dmarc-record-checker",
    name: "DMARC record generator and checker",
    title: "DMARC record generator and checker · coss.com",
    description:
      "Build a DMARC record to publish at _dmarc.yourdomain, or paste one to see what each tag means and what's wrong with it. Runs in your browser.",
    lede: "A DMARC record is one line of TXT with a strict format. Build one here, or paste your current record to read it tag by tag. This checks the text you give it and doesn't look up your DNS.",
    docs: { label: "DMARC", href: "/docs/email/dmarc" },
    product: { label: "coss.com Email", href: "/products/email" },
  },
];

export function toolBySlug(slug: string): FreeTool | undefined {
  return FREE_TOOLS.find((tool) => tool.slug === slug);
}
