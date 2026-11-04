import { PLANS } from "@coss/billing/catalog";
import { formatCents } from "@coss/billing/money";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@coss/ui/components/accordion";
import Link from "next/link";
import type { ReactNode } from "react";
import { estimateEmailMonth, formatPrice } from "@/lib/pricing";

const EXAMPLE_EMAILS = 2_000_000;

/** `text`: the answer as plain text (FAQPage JSON-LD), when `answer` isn't a string already. */
function questions(): { question: string; answer: ReactNode; text?: string }[] {
  const pro = PLANS.pro;
  const example = estimateEmailMonth("pro", EXAMPLE_EMAILS);
  const freeEmails = (PLANS.free.includedUnits["email.recipients"] ?? 0).toLocaleString("en-US");
  return [
    {
      question: "How does the monthly fee work?",
      answer: (
        <>
          On {pro.name} and {PLANS.scale.name}, the fee is credit: it is spent on your usage of any
          coss.com product that month, so a month costs the larger of the fee and your usage. On{" "}
          {pro.name} with {EXAMPLE_EMAILS.toLocaleString("en-US")} emails, usage comes to{" "}
          {formatCents(example.usageCents)}: you pay the {formatPrice(pro.feeCents)} fee at the
          start of the month and the other {formatCents(example.usageCents - pro.feeCents)} with the
          next invoice.
        </>
      ),
      text: `On ${pro.name} and ${PLANS.scale.name}, the fee is credit: it is spent on your usage of any coss.com product that month, so a month costs the larger of the fee and your usage. On ${pro.name} with ${EXAMPLE_EMAILS.toLocaleString("en-US")} emails, usage comes to ${formatCents(example.usageCents)}: you pay the ${formatPrice(pro.feeCents)} fee at the start of the month and the other ${formatCents(example.usageCents - pro.feeCents)} with the next invoice.`,
    },
    {
      question: "Does unused credit roll over?",
      answer:
        "No: a month's plan credit is for that month's usage. Credits from coss.com support or a prepaid commitment can last longer; your billing settings show each one with what's left and when it expires.",
    },
    {
      question: "What counts as an email?",
      answer:
        "Each recipient handed to the email provider: every address in to, cc and bcc, once. Suppressed recipients, and emails that fail before sending or are canceled, cost nothing. Sandbox environments are never billed.",
    },
    {
      question: `What happens after ${freeEmails} emails on ${PLANS.free.name}?`,
      answer: `Live sends beyond the allowance are refused until the next month starts or you upgrade (an upgrade applies as soon as it's paid). Sandbox environments keep working.`,
    },
    {
      question: "How do I change plans?",
      answer:
        "Sign up on Free, then choose a plan in your organization's settings, under Billing. Upgrades take effect as soon as they're paid: you pay the difference for the rest of the month and get it as extra credit. Downgrades and cancellations take effect at the end of the month, and can be undone until then.",
    },
    {
      question: "How can I pay?",
      answer:
        "Paid plans are charged to your card each month. Enterprise contracts can also be invoiced with payment terms or paid by direct debit. Prices are in US dollars and exclude taxes.",
    },
    {
      question: "Can I cap what I spend?",
      answer:
        "Yes. Owners can set a spend limit: when usage beyond your credit reaches it, live sending pauses until the next month or until the limit is raised. Usage alerts go out at 80% and 100% of your credit, and owners can change those thresholds.",
    },
    {
      question: "Can I send SMS?",
      answer: (
        <>
          SMS is available now on every paid plan: it's priced per segment by destination country,
          with phone numbers and US carrier registration fees passed through at cost, and sandbox
          environments simulate it for free on any plan (see the{" "}
          <Link className="text-foreground underline underline-offset-4" href="/docs/sms">
            SMS docs
          </Link>
          ).
        </>
      ),
      text: "SMS is available now on every paid plan: it's priced per segment by destination country, with phone numbers and US carrier registration fees passed through at cost, and sandbox environments simulate it for free on any plan.",
    },
  ];
}

/** The questions as plain text, for the pricing page's FAQPage JSON-LD. */
export function pricingFaq(): { question: string; answer: string }[] {
  return questions().map(({ question, answer, text }) => ({
    question,
    answer: text ?? (typeof answer === "string" ? answer : ""),
  }));
}

/** Billing questions; the details live in the billing guide. */
export function PricingFaq() {
  return (
    <div className="flex flex-col gap-4">
      <Accordion>
        {questions().map((item) => (
          <AccordionItem key={item.question} value={item.question}>
            <AccordionTrigger className="text-base">{item.question}</AccordionTrigger>
            <AccordionPanel className="max-w-2xl text-pretty leading-relaxed">
              {item.answer}
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="text-muted-foreground text-sm">
        More in the{" "}
        <Link className="text-foreground underline underline-offset-4" href="/docs/billing">
          billing guide
        </Link>
        .
      </p>
    </div>
  );
}
