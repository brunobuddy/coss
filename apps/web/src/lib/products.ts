import "server-only";
import { type ProductKey, type ProductUse, productUseInProject } from "@coss/dashboard-routes";
import { listProductPreferences, productActivityByEnvironment } from "@coss/tenancy";
import { cache } from "react";
import { listProjectsWithDefaultEnvironment } from "./projects";

/** The products each environment of the organization uses (once per request: layout and page). */
export const productActivity = cache(productActivityByEnvironment);

/** Where the project's products are in use, seen from one of its environments. */
export async function productUse(input: {
  organizationId: string;
  projectId: string;
  environmentSlug: string;
}): Promise<ProductUse> {
  const [activity, projects] = await Promise.all([
    productActivity(input.organizationId),
    listProjectsWithDefaultEnvironment(input.organizationId),
  ]);
  const environments = projects.find((row) => row.project.id === input.projectId)?.environments;
  return productUseInProject(
    (environments ?? []).map((env) => ({
      slug: env.slug,
      name: env.name,
      products: activity.get(env.id) ?? [],
    })),
    input.environmentSlug,
  );
}

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
