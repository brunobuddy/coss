import "server-only";
import type { ProductKey } from "@coss/dashboard-routes";
import { listProductPreferences, productActivityByEnvironment } from "@coss/tenancy";
import { cache } from "react";

/** The products each environment of the organization uses (once per request: layout and page). */
export const productActivity = cache(productActivityByEnvironment);

/** A member's pinned and hidden products (once per request). */
export const productPreferences = cache((organizationId: string, userId: string) =>
  listProductPreferences({ organizationId, userId }),
);

/** What one product's figure on an environment's home counts. */
export const PRODUCT_FIGURES: Record<ProductKey, { one: string; many: string; recent: boolean }> = {
  email: { one: "email", many: "emails", recent: true },
  marketing: { one: "broadcast", many: "broadcasts", recent: false },
  inboxes: { one: "inbox", many: "inboxes", recent: false },
  sms: { one: "message", many: "messages", recent: true },
  verify: { one: "verification", many: "verifications", recent: true },
  sign: { one: "signature request", many: "signature requests", recent: true },
  forms: { one: "form", many: "forms", recent: false },
  scheduling: { one: "booking", many: "bookings", recent: true },
  hooks: { one: "application", many: "applications", recent: false },
  risk: { one: "assessment", many: "assessments", recent: true },
};
