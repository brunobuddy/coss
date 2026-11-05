/** The dashboard's ticket forms and their labels (zod only, client-safe). */
import { z } from "zod";

export const SUPPORT_CATEGORIES = [
  { key: "technical", label: "Technical problem" },
  { key: "deliverability", label: "Email deliverability" },
  { key: "account", label: "Account and access" },
  { key: "billing", label: "Billing" },
  { key: "sales", label: "Plans and pricing" },
  { key: "other", label: "Something else" },
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["key"];

export function supportCategoryLabel(key: string): string {
  return SUPPORT_CATEGORIES.find((category) => category.key === key)?.label ?? "Something else";
}

export const MAX_SUPPORT_BODY_LENGTH = 50_000;
export const MAX_SUPPORT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_SUPPORT_ATTACHMENTS = 20;
export const MAX_SUPPORT_MESSAGE_BYTES = 25 * 1024 * 1024;

const categoryKeys = SUPPORT_CATEGORIES.map((category) => category.key) as [
  SupportCategory,
  ...SupportCategory[],
];

export const supportBodySchema = z
  .string()
  .trim()
  .min(1, "Write a message.")
  .max(MAX_SUPPORT_BODY_LENGTH, "This message is too long.");

export const newTicketSchema = z.object({
  subject: z.string().trim().min(3, "Add a short subject.").max(200, "This subject is too long."),
  category: z.enum(categoryKeys),
  severity: z.enum(["normal", "urgent"]),
  body: supportBodySchema,
});
export type NewTicketInput = z.output<typeof newTicketSchema>;

export type SupportTicketContextInput = {
  path?: string;
  environmentId?: string;
  resourceType?: string;
  resourceId?: string;
};

/** What a customer sees a ticket's state as. */
export type CustomerTicketState = "with_support" | "waiting_for_you" | "resolved";

export function customerTicketState(status: string): CustomerTicketState {
  if (status === "resolved") return "resolved";
  if (status === "pending") return "waiting_for_you";
  return "with_support";
}

export const CUSTOMER_TICKET_STATE_LABELS: Record<CustomerTicketState, string> = {
  with_support: "With support",
  waiting_for_you: "Waiting for you",
  resolved: "Resolved",
};
