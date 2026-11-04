/** The catalog's contents: coss.com's products. */

export type PartId = "email" | "sms" | "inboxes" | "scheduling";

export interface Product {
  id: PartId;
  name: string;
  /** The SDK namespace. */
  call: string;
  summary: string;
  features: readonly string[];
  /** Its product page (`/products/<slug>`), once it has one. */
  href?: string;
}

export const PRODUCTS: readonly Product[] = [
  {
    id: "email",
    name: "Email",
    call: "coss.email",
    summary: "Transactional email from your own domains, tracked to every recipient.",
    href: "/products/email",
    features: [
      "Single, batch and scheduled sends",
      "Per-recipient delivery events",
      "Open and click tracking",
    ],
  },
  {
    id: "sms",
    name: "SMS",
    call: "coss.sms",
    summary: "Text messages worldwide, on the same key, events and logs as email.",
    href: "/products/sms",
    features: ["Send and receive", "Delivery events on your webhooks", "Suppressions and logs"],
  },
  {
    id: "inboxes",
    name: "Inboxes",
    call: "coss.inboxes",
    href: "/products/inboxes",
    summary:
      "Email addresses for your AI agents, with mail kept as threads and replies that thread.",
    features: [
      "An address per agent, created with one call",
      "A signed webhook for every message",
      "Your own domain or coss.com's",
    ],
  },
  {
    id: "scheduling",
    name: "Scheduling",
    call: "coss.scheduling",
    href: "/products/scheduling",
    summary: "Availability and bookings, from the team behind Cal.com.",
    features: [
      "Availability across calendars",
      "Bookings and reschedules",
      "Booking events on your webhooks",
    ],
  },
];
