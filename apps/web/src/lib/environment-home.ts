import "server-only";
import { PRODUCTS, type ProductKey, visibleProducts } from "@coss/dashboard-routes";
import { emailActivity, listDomains } from "@coss/email";
import { queryLogs } from "@coss/logs";
import type { LogEntryOutput } from "@coss/logs/schemas";
import { listRiskAssessments } from "@coss/risk";
import { ListRiskAssessmentsQuery } from "@coss/risk/schemas";
import { listBookings } from "@coss/scheduling";
import { listSignRequests } from "@coss/sign";
import { listEnvironmentApiKeys, productDailyActivity, productFigures } from "@coss/tenancy";
import { listWebhookEndpoints } from "@coss/webhooks";
import { formatCompact } from "./format";
import { isFirstVisit } from "./home-setup";
import { PRODUCT_FIGURES, productPreferences, productUse } from "./products";
import { schedulingDeps } from "./scheduling";

/** The window of the figures and sparklines. */
export const HOME_DAYS = 14;
const DAY_MS = 86_400_000;
/** Attention counts stop here ("20+"). */
const COUNT_CAP = 20;

export type HomeTone = ProductKey | "neutral";
export type HomeSeverity = "success" | "warning" | "error" | "info" | "neutral";

export type HomeAttentionItem = {
  key: "risk" | "sign" | "email" | "webhooks" | "domains" | "scheduling";
  tone: HomeTone;
  severity: HomeSeverity;
  title: string;
  description: string;
};

/** Log sources by the product they belong to (the rest are Developers' own). */
export const SOURCE_PRODUCT: Partial<Record<string, ProductKey>> = {
  email: "email",
  smtp: "email",
  sms: "sms",
  sign: "sign",
  verify: "verify",
  risk: "risk",
  forms: "forms",
  hooks: "hooks",
  scheduling: "scheduling",
};

export const LEVEL_SEVERITY: Record<LogEntryOutput["level"], HomeSeverity> = {
  info: "neutral",
  warning: "warning",
  error: "error",
};

/**
 * What an environment's home shows, for the dashboard's page and the iOS app's: figures, what
 * needs attention and the latest activity.
 */
export async function loadEnvironmentHome(input: {
  organizationId: string;
  projectId: string;
  userId: string;
  environment: { id: string; slug: string; mode: "live" | "sandbox" };
  can: (permissions: Record<string, string[]>) => boolean;
  now?: Date;
}) {
  const { organizationId, environment, can } = input;
  const now = input.now ?? new Date();
  const scope = { organizationId, environmentId: environment.id };
  const live = environment.mode === "live";

  const [use, preferences] = await Promise.all([
    productUse({
      organizationId,
      projectId: input.projectId,
      environmentSlug: environment.slug,
    }),
    productPreferences(organizationId, input.userId),
  ]);
  const yours = visibleProducts(use.inProject, preferences);
  const uses = (key: ProductKey) => use.here.includes(key);
  const scheduling = schedulingDeps();

  const [figures, daily, keys, domains, endpoints, reviews, awaiting, pending, email, logs] =
    await Promise.all([
      productFigures({ ...scope, since: new Date(now.getTime() - HOME_DAYS * DAY_MS) }),
      productDailyActivity({ ...scope, days: HOME_DAYS, now }),
      listEnvironmentApiKeys(scope),
      can({ domain: ["read"] }) ? listDomains({ organizationId }) : null,
      can({ webhook: ["read"] }) ? listWebhookEndpoints(scope) : null,
      uses("risk") && can({ risk: ["read"] })
        ? listRiskAssessments(
            scope,
            ListRiskAssessmentsQuery.parse({ review_status: "open", limit: COUNT_CAP }),
          )
        : null,
      uses("sign") && can({ sign: ["read"] })
        ? listSignRequests({ ...scope, status: ["sent"], limit: COUNT_CAP })
        : null,
      scheduling && uses("scheduling") && can({ scheduling: ["read"] })
        ? listBookings(scope, { limit: COUNT_CAP, status: "pending_approval" }, scheduling)
        : null,
      uses("email") && can({ email: ["read"] })
        ? emailActivity({ ...scope, since: new Date(now.getTime() - 6 * DAY_MS), now })
        : null,
      can({ log: ["read"] })
        ? queryLogs({ ...scope, from: new Date(now.getTime() - 7 * DAY_MS), to: now, limit: 200 })
        : null,
    ]);

  const attention: HomeAttentionItem[] = [];
  if (reviews && reviews.data.length > 0) {
    const count = countLabel(reviews.data.length, reviews.has_more);
    attention.push({
      key: "risk",
      tone: "risk",
      severity: "warning",
      title: `${count} ${reviews.data.length === 1 ? "assessment needs" : "assessments need"} a review`,
      description: "Allow or block them, and report the outcome to sharpen future scores.",
    });
  }
  if (pending && pending.data.length > 0) {
    const count = countLabel(pending.data.length, pending.hasMore);
    attention.push({
      key: "scheduling",
      tone: "scheduling",
      severity: "warning",
      title: `${count} ${pending.data.length === 1 ? "booking is" : "bookings are"} awaiting approval`,
      description: "Approve or decline them before they expire.",
    });
  }
  if (awaiting && awaiting.data.length > 0) {
    const count = countLabel(awaiting.data.length, awaiting.hasMore);
    attention.push({
      key: "sign",
      tone: "sign",
      severity: "info",
      title: `${count} signature ${awaiting.data.length === 1 ? "request is" : "requests are"} waiting on signers`,
      description: "Sent and not yet completed. Reminders go out on their own.",
    });
  }
  if (email && email.totals.failed > 0) {
    attention.push({
      key: "email",
      tone: "email",
      severity: "error",
      title: `${formatCompact(email.totals.failed)} ${email.totals.failed === 1 ? "email" : "emails"} failed this week`,
      description: "See why each one failed: a bounce, a suppression or a rejected sender.",
    });
  }
  const failingEndpoints = (endpoints ?? []).filter(
    (endpoint) => endpoint.failingSince !== null || endpoint.disabledReason === "failing",
  );
  if (failingEndpoints.length > 0) {
    attention.push({
      key: "webhooks",
      tone: "neutral",
      severity: "error",
      title: `${failingEndpoints.length} webhook ${failingEndpoints.length === 1 ? "endpoint is" : "endpoints are"} failing`,
      description: "Deliveries keep failing; failing endpoints are turned off after a while.",
    });
  }
  const brokenDomains = (live ? (domains ?? []) : []).filter((domain) =>
    ["failed", "temporary_failure"].includes(domain.status),
  );
  if (brokenDomains.length > 0) {
    attention.push({
      key: "domains",
      tone: "email",
      severity: "error",
      title: `${brokenDomains.length === 1 ? brokenDomains[0]?.name : `${brokenDomains.length} domains`} can't be verified`,
      description: "Their DNS records are missing or changed, so live email can't use them.",
    });
  }

  const yourProducts = PRODUCTS.filter((product) => yours.includes(product.key));
  const recent = yourProducts
    .filter((product) => PRODUCT_FIGURES[product.key].recent && figures[product.key] > 0)
    .map((product) => {
      const figure = PRODUCT_FIGURES[product.key];
      const count = figures[product.key];
      return `${formatCompact(count)} ${count === 1 ? figure.one : figure.many}`;
    });
  const hasKey = keys.length > 0;
  const hasActivity = Object.values(figures).some((count) => count > 0);
  const firstVisit = isFirstVisit({ hasKey, hasActivity });
  const summary =
    recent.length > 0
      ? `In the last ${HOME_DAYS} days: ${listOf(recent)}.`
      : live
        ? firstVisit
          ? "Nothing has gone out from here yet."
          : "Nothing has gone out from here in the last two weeks."
        : "A sandbox: everything runs through every check, but nothing is delivered.";

  return {
    use,
    yours,
    figures,
    daily,
    domains,
    logs,
    attention,
    yourProducts,
    summary,
    hasKey,
    hasActivity,
    firstVisit,
  };
}

/**
 * The week's lines by kind (source, event and level), newest kind first, each shown by its latest
 * line with how many there were: a burst of webhook attempts doesn't push everything else out.
 */
export function groupActivity(lines: LogEntryOutput[]): { line: LogEntryOutput; count: number }[] {
  const groups = new Map<string, { line: LogEntryOutput; count: number }>();
  for (const line of lines) {
    const kind = `${line.source}|${line.type}|${line.level}|${line.method ? activityTitle(line) : ""}`;
    const group = groups.get(kind);
    if (group) group.count++;
    else groups.set(kind, { line, count: 1 });
  }
  return [...groups.values()];
}

/** An API line by its route, anything else by its message with URLs cut to their host. */
export function activityTitle(line: LogEntryOutput): string {
  if (line.method && line.path) return `${line.method} ${line.route ?? line.path}`;
  return line.message.replace(/https?:\/\/([^/\s]+)\S*/g, "$1");
}

function countLabel(count: number, more: boolean): string {
  return more ? `${count}+` : String(count);
}

/** `["a", "b", "c"]` → `"a, b and c"`. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
