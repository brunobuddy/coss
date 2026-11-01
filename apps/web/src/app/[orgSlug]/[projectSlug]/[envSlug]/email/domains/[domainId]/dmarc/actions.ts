"use server";

import { getDomain, receiveSampleDmarcReport } from "@coss/email";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { emailRuntime } from "@/lib/email-runtime";
import { requireOrgPermission } from "@/lib/session";
import { canSimulateDmarcReports } from "./simulate";

/**
 * Ingests a sample aggregate report about the domain, as if a mailbox provider had sent one
 * (local development: only while the dashboard runs the fake provider).
 */
export async function sendSampleDmarcReportAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      domain: ["verify"],
    });
    const managedDomain = emailRuntime().inbound?.managedDomain;
    if (!canSimulateDmarcReports() || !managedDomain) {
      throw new ActionError("Sample reports are only available in local development.");
    }
    const domain = await getDomain({
      organizationId: context.organization.id,
      id: formString(formData, "domainId"),
    });
    if (!domain) throw new ActionError("Domain not found.");
    const outcome = await receiveSampleDmarcReport(domain, managedDomain);
    if (outcome?.kind !== "recorded") {
      throw new ActionError(
        `The sample report wasn't recorded (${outcome?.kind ?? "no address"}).`,
      );
    }
    refresh();
    return null;
  });
}
