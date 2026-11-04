import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { SALES_EMAIL } from "@/lib/site";

const CONTACTS = [
  {
    title: "Support",
    body: "Something isn't working, or you have a question about your account. Every ticket is read and answered by a person.",
    address: "support@coss.com",
    more: { label: "How support works", href: "/docs/support" },
  },
  {
    title: "Sales",
    body: "Enterprise plans, contract terms, invoicing and high volume.",
    address: SALES_EMAIL,
    more: { label: "Pricing", href: "/pricing" },
  },
  {
    title: "Privacy",
    body: "Privacy questions and requests about your data, and our Data Protection Officer.",
    address: "privacy@cal.com",
    more: { label: "Privacy Policy", href: "/legal/privacy" },
  },
  {
    title: "Legal",
    body: "Notices under the Terms and contract questions.",
    address: "legal@cal.com",
    more: { label: "Terms", href: "/legal/terms" },
  },
] as const;

export const metadata: Metadata = pageMetadata({
  title: "Contact · coss.com",
  description: "How to reach coss.com: support, sales, privacy and legal.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-16 sm:py-24">
      <h1 className="text-balance font-semibold text-[clamp(2.5rem,6vw,4rem)] leading-[0.95] tracking-[-0.035em]">
        Talk to us.
      </h1>
      <ul className="flex flex-col border-t">
        {CONTACTS.map((contact) => (
          <li className="flex flex-col gap-1.5 border-b py-6" key={contact.title}>
            <h2 className="font-semibold text-xl tracking-tight">{contact.title}</h2>
            <p className="text-pretty text-muted-foreground">{contact.body}</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a
                className="font-mono underline underline-offset-2"
                href={`mailto:${contact.address}`}
              >
                {contact.address}
              </a>
              <Link
                className="text-muted-foreground underline underline-offset-2"
                href={contact.more.href}
              >
                {contact.more.label}
              </Link>
            </p>
          </li>
        ))}
      </ul>
      <p className="max-w-prose text-pretty text-muted-foreground text-sm">
        To report a vulnerability, use the responsible disclosure program at{" "}
        <a className="underline underline-offset-2" href="https://cal.com/security">
          cal.com/security
        </a>
        . See the{" "}
        <Link className="underline underline-offset-2" href="/status">
          status page
        </Link>{" "}
        if something seems down.
      </p>
    </main>
  );
}
