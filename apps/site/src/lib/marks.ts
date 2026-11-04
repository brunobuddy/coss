/*
 * Plain constants shared by the MDX collections' schemas (compiled by the fumadocs-mdx macro, so
 * no React or `@/` imports here) and the pages.
 */

/** Every engraving a product block can carry (`Engraving` in src/components/home/iso.tsx). */
export const MARKS = [
  "email",
  "sms",
  "scheduling",
  "webhooks",
  "logs",
  "domains",
  "keys",
  "inboxes",
  "inbound",
  "subaccounts",
  "smtp",
  "marketing",
  "sign",
  "verify",
  "forms",
  "hooks",
  "risk",
  "limits",
  "platform",
  "security",
  "agents",
  "sdks",
] as const;

export type Mark = (typeof MARKS)[number];

/** The groups of /products and of the header's product menu. */
export const PRODUCT_GROUPS = ["Email", "Messaging", "Trust", "Platform", "Developers"] as const;

export type ProductGroup = (typeof PRODUCT_GROUPS)[number];
