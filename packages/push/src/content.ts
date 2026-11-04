/**
 * What a notification says and where it opens, resolved when it is sent: slugs and names as they
 * are now, and nothing at all if what it was about is already resolved. The text passes through
 * Apple, so it holds only organization, project and environment names and counts: never
 * free-form text (descriptions, application names), addresses, URLs, scores or notes.
 */
import { db, schema } from "@coss/db";
import { and, count, eq } from "drizzle-orm";
import type { PushNotificationRow } from "./outbox.ts";

const {
  billingBudgetHold,
  billingHold,
  billingInvoice,
  environment,
  hookEndpoint,
  logDrain,
  organization,
  organizationDeletion,
  project,
  reputationStanding,
  riskAssessment,
  webhookEndpoint,
} = schema;

export type PushContent = {
  title: string;
  body: string;
  /** A dashboard path, which is also the app's route for the same page. */
  path: string;
};

export type ResolvedPush = { content: PushContent } | { skip: string };

type Place = {
  org: { name: string; slug: string };
  env: { name: string; slug: string; projectName: string; projectSlug: string } | null;
};

export async function resolvePush(row: PushNotificationRow): Promise<ResolvedPush> {
  const place = await placeOf(row);
  if (!place) return { skip: "organization_gone" };
  return (await RESOLVERS[row.kind](row, place)) ?? { skip: "resolved" };
}

async function placeOf(row: PushNotificationRow): Promise<Place | null> {
  const [org] = await db
    .select({ name: organization.name, slug: organization.slug, deleting: organizationDeletion.id })
    .from(organization)
    .leftJoin(organizationDeletion, eq(organizationDeletion.organizationId, organization.id))
    .where(eq(organization.id, row.organizationId));
  if (!org || org.deleting) return null;
  if (!row.environmentId) return { org, env: null };
  const [env] = await db
    .select({
      name: environment.name,
      slug: environment.slug,
      projectName: project.name,
      projectSlug: project.slug,
    })
    .from(environment)
    .innerJoin(project, eq(project.id, environment.projectId))
    .where(
      and(
        eq(environment.id, row.environmentId),
        eq(environment.organizationId, row.organizationId),
      ),
    );
  return env ? { org, env } : null;
}

type Resolver = (
  row: PushNotificationRow,
  place: Place,
) => Promise<{ content: PushContent } | null>;

function envPath(place: Place, rest: string): string {
  const env = place.env;
  if (!env) throw new Error("This notification needs an environment.");
  return `/${place.org.slug}/projects/${env.projectSlug}/${env.slug}/${rest}`;
}

function envLabel(place: Place): string {
  return place.env ? `${place.env.projectName} / ${place.env.name}` : place.org.name;
}

function money(cents: bigint, currency: string): string {
  return (Number(cents) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
}

async function standing(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ status: reputationStanding.status })
    .from(reputationStanding)
    .where(eq(reputationStanding.organizationId, organizationId));
  return row?.status ?? null;
}

const RESOLVERS: Record<PushNotificationRow["kind"], Resolver> = {
  async reputation_warning(row, place) {
    if ((await standing(row.organizationId)) !== "warning") return null;
    return {
      content: {
        title: "Account warning",
        body: `${place.org.name} received a warning about its sending reputation.`,
        path: `/${place.org.slug}/reputation`,
      },
    };
  },

  async reputation_suspended(row, place) {
    if ((await standing(row.organizationId)) !== "suspended") return null;
    return {
      content: {
        title: "Account suspended",
        body: `Live sending for ${place.org.name} is suspended.`,
        path: `/${place.org.slug}/reputation`,
      },
    };
  },

  async billing_payment_failed(row, place) {
    const [invoice] = await db
      .select({
        number: billingInvoice.number,
        status: billingInvoice.status,
        amountDueCents: billingInvoice.amountDueCents,
        currency: billingInvoice.currency,
      })
      .from(billingInvoice)
      .where(
        and(
          eq(billingInvoice.id, row.subjectId),
          eq(billingInvoice.organizationId, row.organizationId),
        ),
      );
    if (invoice?.status !== "open") return null;
    const label = invoice.number ? `invoice ${invoice.number}` : "an invoice";
    return {
      content: {
        title: "Payment failed",
        body: `The payment of ${money(invoice.amountDueCents, invoice.currency)} for ${label} of ${place.org.name} failed.`,
        path: `/${place.org.slug}/settings/billing/invoices/${row.subjectId}`,
      },
    };
  },

  async billing_hold_placed(row, place) {
    const [hold] = await db
      .select({ reason: billingHold.reason })
      .from(billingHold)
      .where(
        and(
          eq(billingHold.organizationId, row.organizationId),
          eq(billingHold.reason, row.subjectId as typeof billingHold.$inferSelect.reason),
        ),
      );
    if (!hold) return null;
    const why =
      hold.reason === "spend_limit"
        ? "it reached its spend limit"
        : hold.reason === "credit_limit"
          ? "it reached its credit limit"
          : hold.reason === "delinquent"
            ? "an invoice is overdue"
            : "of its billing";
    return {
      content: {
        title: "Live sending on hold",
        body: `Live sending for ${place.org.name} is on hold because ${why}.`,
        path: `/${place.org.slug}/settings/billing`,
      },
    };
  },

  async billing_budget_paused(row, place) {
    const [scope = "", targetId = ""] = row.subjectId.split(":");
    const [hold] = await db
      .select({ scope: billingBudgetHold.scope })
      .from(billingBudgetHold)
      .where(
        and(
          eq(billingBudgetHold.organizationId, row.organizationId),
          eq(billingBudgetHold.scope, scope as typeof billingBudgetHold.$inferSelect.scope),
          eq(billingBudgetHold.targetId, targetId),
        ),
      );
    if (!hold) return null;
    let what = "An API key";
    if (hold.scope === "user") what = "A member's personal API keys";
    if (hold.scope === "project") {
      const [found] = await db
        .select({ name: project.name })
        .from(project)
        .where(and(eq(project.id, targetId), eq(project.organizationId, row.organizationId)));
      what = found ? `The ${found.name} project` : "A project";
    }
    return {
      content: {
        title: "Budget used up",
        body: `${what} of ${place.org.name} reached a monthly budget, so live sending there is paused.`,
        path: `/${place.org.slug}/spend`,
      },
    };
  },

  async webhook_endpoint_disabled(row, place) {
    const [endpoint] = await db
      .select({
        enabled: webhookEndpoint.enabled,
        disabledReason: webhookEndpoint.disabledReason,
      })
      .from(webhookEndpoint)
      .where(
        and(
          eq(webhookEndpoint.id, row.subjectId),
          eq(webhookEndpoint.organizationId, row.organizationId),
        ),
      );
    if (!endpoint || endpoint.enabled || endpoint.disabledReason !== "failing") return null;
    return {
      content: {
        title: "Webhook endpoint disabled",
        body: `A webhook endpoint in ${envLabel(place)} was disabled after failing for 5 days.`,
        path: envPath(place, `webhooks/${row.subjectId}`),
      },
    };
  },

  async hook_endpoint_disabled(row, place) {
    const [endpoint] = await db
      .select({
        applicationId: hookEndpoint.applicationId,
        enabled: hookEndpoint.enabled,
        disabledReason: hookEndpoint.disabledReason,
      })
      .from(hookEndpoint)
      .where(
        and(
          eq(hookEndpoint.id, row.subjectId),
          eq(hookEndpoint.organizationId, row.organizationId),
        ),
      );
    if (!endpoint || endpoint.enabled || endpoint.disabledReason !== "failing") return null;
    return {
      content: {
        title: "Hooks endpoint disabled",
        body: `A Hooks endpoint in ${envLabel(place)} was disabled after failing for 5 days.`,
        path: envPath(place, `hooks/${endpoint.applicationId}/endpoints/${row.subjectId}`),
      },
    };
  },

  async log_drain_disabled(row, place) {
    const [drain] = await db
      .select({
        enabled: logDrain.enabled,
        disabledReason: logDrain.disabledReason,
      })
      .from(logDrain)
      .where(and(eq(logDrain.id, row.subjectId), eq(logDrain.organizationId, row.organizationId)));
    if (!drain || drain.enabled || drain.disabledReason !== "failing") return null;
    return {
      content: {
        title: "Log drain disabled",
        body: `A log drain in ${envLabel(place)} was disabled after its deliveries kept failing.`,
        path: envPath(place, `log-drains/${row.subjectId}`),
      },
    };
  },

  async risk_review(row, place) {
    if (!row.environmentId) return null;
    const [open] = await db
      .select({ count: count() })
      .from(riskAssessment)
      .where(
        and(
          eq(riskAssessment.environmentId, row.environmentId),
          eq(riskAssessment.organizationId, row.organizationId),
          eq(riskAssessment.reviewStatus, "open"),
        ),
      );
    const waiting = open?.count ?? 0;
    if (waiting === 0) return null;
    return {
      content: {
        title: "Risk review",
        body:
          waiting === 1
            ? `An assessment is waiting for review in ${envLabel(place)}.`
            : `${waiting} assessments are waiting for review in ${envLabel(place)}.`,
        path: envPath(place, "risk"),
      },
    };
  },
};
