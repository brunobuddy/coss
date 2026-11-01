"use server";

import { orgLinkHref } from "@coss/dashboard-routes";
import {
  checkDomain,
  checkReceivingDomain,
  createDomain,
  createReceivingDomain,
  createTrackingDomain,
  deleteDomain,
  deleteReceivingDomain,
  deleteTrackingDomain,
  getDomain,
  getReceivingDomain,
  getTrackingDomain,
  restartDomainVerification,
  setDomainSharedWithSubaccounts,
  verifyTrackingDomain,
} from "@coss/email";
import { getEnvironmentById } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { env } from "@/env";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { domainConnectPlan, domainConnectUrl } from "@/lib/domain-connect";
import { emailRuntime } from "@/lib/email-runtime";
import { isPlatformAdmin, type OrgContext, requireOrgPermission } from "@/lib/session";
import { isSystemOrganization } from "@/lib/system-organization";

/** What a manual check found, for the button's toast (the page shows the details). */
export type VerifyOutcome = { status: string; restarted: boolean };

/** A manual "Verify now" waits at least this long after the previous check. */
const MANUAL_CHECK_INTERVAL_MS = 10_000;

/** The domain addressed by the form, inside the already-authorized organization. */
async function domainFromForm(context: OrgContext, formData: FormData) {
  const domain = await getDomain({
    organizationId: context.organization.id,
    id: formString(formData, "domainId"),
  });
  if (!domain) throw new ActionError("Domain not found.");
  return domain;
}

/** Claims the domain, creates its provider identity, and opens its DNS records page. */
export async function addDomainAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["create"],
    });
    const domain = await createDomain(
      {
        organizationId: context.organization.id,
        name: formString(formData, "name"),
        userId: context.session.user.id,
        // coss.com's own organization sends from coss.com, which no one else may claim: platform admins
        // may add reserved domains there only (anywhere until it is configured, to bootstrap it).
        allowReserved:
          isPlatformAdmin(context.session) &&
          (!env.NOTIFICATIONS_ENVIRONMENT_ID ||
            (await isSystemOrganization(context.organization.id))),
      },
      emailRuntime().domainDeps,
    );
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "domain.created",
      target: { type: "domain", id: domain.id, label: domain.name },
    });
    redirect(orgLinkHref(context.organization.slug, `/email/domains/${domain.id}`));
  });
}

/** Checks the provider and DNS now instead of waiting for the next scheduled check. */
export async function verifyDomainAction(
  _previous: ActionResult<VerifyOutcome> | null,
  formData: FormData,
): Promise<ActionResult<VerifyOutcome>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["verify"],
    });
    const domain = await domainFromForm(context, formData);
    const deps = emailRuntime().domainDeps;
    const restarted = domain.status === "failed";
    let checked: { status: string };
    if (restarted) {
      checked = await restartDomainVerification(
        { organizationId: domain.organizationId, id: domain.id },
        deps,
      );
    } else {
      const since = domain.lastCheckedAt ? Date.now() - domain.lastCheckedAt.getTime() : Infinity;
      if (since < MANUAL_CHECK_INTERVAL_MS) {
        throw new ActionError("This domain was just checked. Try again in a few seconds.");
      }
      checked = await checkDomain({ organizationId: domain.organizationId, id: domain.id }, deps);
    }
    // Its tracking and receiving domains show their own problems on their cards.
    await verifyTrackingDomain(
      { organizationId: domain.organizationId, domainId: domain.id },
      deps,
    ).catch((error: unknown) => {
      console.error(`[web:domains] checking the tracking domain of ${domain.id} failed:`, error);
    });
    const inbound = emailRuntime().inbound;
    const target = { organizationId: domain.organizationId, domainId: domain.id };
    if (inbound && (await getReceivingDomain(target))) {
      await checkReceivingDomain(target, inbound, deps.dns).catch((error: unknown) => {
        console.error(`[web:domains] checking the receiving domain of ${domain.id} failed:`, error);
      });
    }
    refresh();
    return { status: checked.status, restarted };
  });
}

/**
 * Sends the member to the domain's DNS provider to add its records in one click (Domain Connect).
 * What to add is worked out again here, from the domain as it is now.
 */
export async function connectDnsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["verify"],
    });
    const domain = await domainFromForm(context, formData);
    const tracking = await getTrackingDomain({
      organizationId: domain.organizationId,
      domainId: domain.id,
    });
    const plan = await domainConnectPlan(domain, tracking);
    if (!plan) {
      throw new ActionError(
        "One-click setup isn't available for this domain. Add the records below.",
      );
    }
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "domain.dns_connect_started",
      target: { type: "domain", id: domain.id, label: domain.name },
      metadata: { provider: plan.provider.providerId, groups: plan.groups },
    });
    redirect(domainConnectUrl(plan, { orgSlug: context.organization.slug, domainId: domain.id }));
  });
}

/** Sets up a subdomain as the domain's tracking domain (the CNAME to publish shows on its page). */
export async function addTrackingDomainAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["create"],
    });
    const domain = await domainFromForm(context, formData);
    const hostname = formString(formData, "hostname");
    await createTrackingDomain(
      { organizationId: domain.organizationId, domainId: domain.id, hostname },
      emailRuntime().domainDeps,
    );
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "tracking_domain.created",
      target: { type: "domain", id: domain.id, label: domain.name },
      metadata: { hostname },
    });
    refresh();
    return null;
  });
}

/** Checks the tracking domain now (or starts a `failed` one over). */
export async function checkTrackingDomainAction(
  _previous: ActionResult<VerifyOutcome> | null,
  formData: FormData,
): Promise<ActionResult<VerifyOutcome>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["verify"],
    });
    const domain = await domainFromForm(context, formData);
    const target = { organizationId: domain.organizationId, domainId: domain.id };
    const tracking = await getTrackingDomain(target);
    if (!tracking) throw new ActionError("This domain has no tracking domain.");
    const since = tracking.lastCheckedAt ? Date.now() - tracking.lastCheckedAt.getTime() : Infinity;
    if (tracking.status !== "failed" && since < MANUAL_CHECK_INTERVAL_MS) {
      throw new ActionError("This tracking domain was just checked. Try again in a few seconds.");
    }
    const checked = await verifyTrackingDomain(target, emailRuntime().domainDeps);
    refresh();
    return { status: checked?.status ?? tracking.status, restarted: tracking.status === "failed" };
  });
}

/** Removes the tracking domain; links in emails already sent through it stop working. */
export async function removeTrackingDomainAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["delete"],
    });
    const domain = await domainFromForm(context, formData);
    await deleteTrackingDomain(
      { organizationId: domain.organizationId, domainId: domain.id },
      emailRuntime().domainDeps,
    );
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "tracking_domain.deleted",
      target: { type: "domain", id: domain.id, label: domain.name },
    });
    refresh();
    return null;
  });
}

/** Starts receiving email at a hostname of the domain, for one of the organization's environments. */
export async function addReceivingDomainAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["create"],
    });
    const domain = await domainFromForm(context, formData);
    const inbound = emailRuntime().inbound;
    if (!inbound) throw new ActionError("This deployment does not receive email.");
    const environment = await getEnvironmentById({
      organizationId: context.organization.id,
      environmentId: formString(formData, "environmentId"),
    });
    if (!environment) throw new ActionError("Choose an environment to receive the emails.");
    const created = await createReceivingDomain(
      {
        organizationId: domain.organizationId,
        domainId: domain.id,
        environmentId: environment.id,
        hostname: formString(formData, "hostname"),
      },
      inbound,
      emailRuntime().dns,
    );
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      projectId: environment.projectId,
      environmentId: environment.id,
      action: "domain.receiving_enabled",
      target: { type: "domain", id: domain.id, label: domain.name },
      metadata: { hostname: created.hostname },
    });
    refresh();
    return null;
  });
}

/** Checks the receiving domain's MX record now. */
export async function checkReceivingDomainAction(
  _previous: ActionResult<VerifyOutcome> | null,
  formData: FormData,
): Promise<ActionResult<VerifyOutcome>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["verify"],
    });
    const domain = await domainFromForm(context, formData);
    const inbound = emailRuntime().inbound;
    if (!inbound) throw new ActionError("This deployment does not receive email.");
    const target = { organizationId: domain.organizationId, domainId: domain.id };
    const receiving = await getReceivingDomain(target);
    if (!receiving) throw new ActionError("This domain doesn't receive email.");
    const since = receiving.lastCheckedAt
      ? Date.now() - receiving.lastCheckedAt.getTime()
      : Infinity;
    if (since < MANUAL_CHECK_INTERVAL_MS) {
      throw new ActionError("This MX record was just checked. Try again in a few seconds.");
    }
    const checked = await checkReceivingDomain(target, inbound, emailRuntime().dns);
    refresh();
    return { status: checked.record.status, restarted: false };
  });
}

/** Stops receiving at the domain's hostname; emails already received are kept. */
export async function removeReceivingDomainAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["delete"],
    });
    const domain = await domainFromForm(context, formData);
    const removed = await deleteReceivingDomain({
      organizationId: domain.organizationId,
      domainId: domain.id,
    });
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "domain.receiving_disabled",
      target: { type: "domain", id: domain.id, label: domain.name },
      metadata: { hostname: removed.hostname },
    });
    refresh();
    return null;
  });
}

/** Removes the domain and its provider identity; emails can no longer be sent from it. */
export async function deleteDomainAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["delete"],
    });
    const domain = await domainFromForm(context, formData);
    await deleteDomain(
      { organizationId: domain.organizationId, id: domain.id },
      emailRuntime().domainDeps,
    );
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "domain.deleted",
      target: { type: "domain", id: domain.id, label: domain.name },
    });
    redirect(orgLinkHref(context.organization.slug, "/email/domains"));
  });
}

/** Lets the organization's sub-accounts send from this domain of its own, or stops them. */
export async function shareDomainWithSubaccountsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["create"],
    });
    const domain = await domainFromForm(context, formData);
    const shared = formString(formData, "shared") === "true";
    await setDomainSharedWithSubaccounts({
      organizationId: domain.organizationId,
      id: domain.id,
      shared,
    });
    await recordAudit(context.session, {
      organizationId: context.organization.id,
      action: "domain.updated",
      target: { type: "domain", id: domain.id, label: domain.name },
      metadata: { shared_with_subaccounts: shared },
    });
    refresh();
    return null;
  });
}
