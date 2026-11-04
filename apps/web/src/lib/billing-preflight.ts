import "server-only";
import { FEATURE_LABELS, type FeatureKey, PLANS, type PlanKey } from "@coss/billing";
import { db } from "@coss/db";
import { hasLiveSubaccounts } from "@coss/email";
import { hasCalendarDelegations } from "@coss/scheduling";
import { getOrganizationSsoProvider, hasScimConnection } from "@coss/tenancy";

/** How much of each feature the organization uses now (what a downgrade would leave behind). */
async function featureUsage(organizationId: string): Promise<Record<FeatureKey, number>> {
  const [sso, scim, drain, tracking, subaccount, delegation] = await Promise.all([
    getOrganizationSsoProvider({ organizationId }),
    hasScimConnection({ organizationId }),
    db.query.logDrain.findFirst({
      columns: { id: true },
      where: (row, { eq }) => eq(row.organizationId, organizationId),
    }),
    db.query.trackingDomain.findFirst({
      columns: { id: true },
      where: (row, { eq }) => eq(row.organizationId, organizationId),
    }),
    // Live sub-accounts (sandbox ones are free on every plan).
    hasLiveSubaccounts(organizationId),
    hasCalendarDelegations(organizationId),
  ]);
  return {
    sso: sso ? 1 : 0,
    scim: scim ? 1 : 0,
    logDrains: drain ? 1 : 0,
    trackingDomains: tracking ? 1 : 0,
    // The audit log keeps recording on every plan; losing access to it removes nothing.
    auditLog: 0,
    // An add-on: billing itself refuses a downgrade to a plan it isn't offered on.
    dedicatedIps: 0,
    subaccounts: subaccount ? 1 : 0,
    calendarDelegation: delegation ? 1 : 0,
  };
}

const REMOVE: Record<FeatureKey, string> = {
  sso: "Remove your SSO provider (Settings → Single sign-on).",
  scim: "Disconnect directory sync (Settings → Directory sync).",
  logDrains: "Delete your log drains.",
  trackingDomains: "Remove your custom tracking domains (Domains).",
  auditLog: "",
  dedicatedIps: "",
  subaccounts: "Delete your live email sub-accounts.",
  calendarDelegation: "Delete your calendar delegations (Scheduling → Calendar delegation).",
};

/**
 * Why a self-serve downgrade to `target` is refused: features the organization uses that the
 * lower plan lacks (they would stop working). Count limits don't block: what exists keeps working.
 */
export async function downgradeBlockers(
  organizationId: string,
  target: PlanKey,
): Promise<string[]> {
  const usage = await featureUsage(organizationId);
  const features = PLANS[target].entitlements.features;
  return (Object.keys(usage) as FeatureKey[])
    .filter((feature) => usage[feature] > 0 && !features[feature])
    .map((feature) => REMOVE[feature] || `Stop using ${FEATURE_LABELS[feature]}.`);
}
