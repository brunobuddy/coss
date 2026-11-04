import { Button } from "@coss/ui/components/button";
import { MailIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Hero, Page, Tray } from "@/components/marketing/kit";
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
    <Page>
      <Hero headline="Talk to us." lede={<p>Support, sales, privacy and legal.</p>}>
        <div className="mx-auto flex max-w-4xl flex-col gap-8 pb-16 sm:pb-24">
          <ul className="grid gap-4 sm:grid-cols-2">
            {CONTACTS.map((contact) => (
              <li key={contact.title}>
                <Tray
                  bodyClassName="flex h-full flex-col gap-4"
                  className="h-full"
                  title={contact.title}
                >
                  <p className="flex-1 text-pretty text-muted-foreground leading-snug">
                    {contact.body}
                  </p>
                  <p className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Button render={<a href={`mailto:${contact.address}`} />} variant="outline">
                      <MailIcon />
                      {contact.address}
                    </Button>
                    <Link
                      className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
                      href={contact.more.href}
                    >
                      {contact.more.label}
                    </Link>
                  </p>
                </Tray>
              </li>
            ))}
          </ul>
          <p className="mx-auto max-w-prose text-pretty text-center text-muted-foreground text-sm">
            To report a vulnerability, use the responsible disclosure program at{" "}
            <a className="underline underline-offset-4" href="https://cal.com/security">
              cal.com/security
            </a>
            . See the{" "}
            <Link className="underline underline-offset-4" href="/status">
              status page
            </Link>{" "}
            if something seems down.
          </p>
        </div>
      </Hero>
    </Page>
  );
}
