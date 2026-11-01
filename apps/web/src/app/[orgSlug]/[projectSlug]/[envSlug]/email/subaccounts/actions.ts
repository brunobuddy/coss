"use server";

import {
  createSubaccount,
  deleteSubaccount,
  findSubaccount,
  reinstateSubaccount,
  type SubaccountRow,
  updateSubaccount,
} from "@coss/email";
import { MAX_SUBACCOUNT_QUOTA } from "@coss/email/subaccount-schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { planGate } from "@/lib/billing";
import { type OrgContext, requireOrgPermission } from "@/lib/session";

type SubaccountPermission = "create" | "update" | "delete";

function contextFor(formData: FormData, action: SubaccountPermission) {
  return requireOrgPermission(formString(formData, "orgSlug"), { subaccount: [action] });
}

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return found.environment;
}

/** The sub-account addressed by the form, checked to belong to that environment. */
async function subaccountFromForm(context: OrgContext, formData: FormData): Promise<SubaccountRow> {
  const environment = await environmentFromForm(context, formData);
  const row = await findSubaccount({
    organizationId: context.organization.id,
    environmentId: environment.id,
    ref: formString(formData, "subaccountId"),
  });
  if (!row) throw new ActionError("Sub-account not found.");
  return row;
}

function audit(
  context: OrgContext,
  row: SubaccountRow,
  action: string,
  metadata?: Record<string, unknown>,
) {
  return recordAudit(context.session, {
    organizationId: context.organization.id,
    action,
    target: { type: "subaccount", id: row.id, label: row.uid ?? row.name },
    projectId: row.projectId,
    environmentId: row.environmentId,
    metadata,
  });
}

/** A quota field: empty removes it, else a whole number in range. */
function quotaField(formData: FormData, name: string, label: string): number | null {
  const raw = formString(formData, name).replaceAll(",", "");
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_SUBACCOUNT_QUOTA) {
    throw new ActionError(
      `${label} must be a whole number from 1 to ${MAX_SUBACCOUNT_QUOTA.toLocaleString("en-US")}.`,
    );
  }
  return value;
}

export async function createSubaccountAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const context = await contextFor(formData, "create");
    const environment = await environmentFromForm(context, formData);
    const name = formString(formData, "name");
    if (!name) throw new ActionError("Enter a name.");
    const row = await createSubaccount({
      organizationId: context.organization.id,
      environmentId: environment.id,
      name,
      uid: formString(formData, "uid") || null,
      plans: planGate(),
    });
    await audit(context, row, "subaccount.created");
    refresh();
    return { id: row.id };
  });
}

export async function saveSubaccountQuotasAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const row = await subaccountFromForm(context, formData);
    const quotas = {
      recipients_per_day: quotaField(formData, "perDay", "The daily quota"),
      recipients_per_second: quotaField(formData, "perSecond", "The per-second quota"),
      burst: quotaField(formData, "burst", "The burst"),
    };
    await updateSubaccount({ organizationId: context.organization.id, id: row.id, quotas });
    await audit(context, row, "subaccount.updated", { fields: ["quotas"] });
    refresh();
    return null;
  });
}

export async function setSubaccountStatusAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const row = await subaccountFromForm(context, formData);
    const status = formString(formData, "status") === "disabled" ? "disabled" : "active";
    await updateSubaccount({ organizationId: context.organization.id, id: row.id, status });
    await audit(context, row, "subaccount.updated", { fields: ["status"], status });
    refresh();
    return null;
  });
}

export async function reinstateSubaccountAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await contextFor(formData, "update");
    const row = await subaccountFromForm(context, formData);
    const { changed } = await reinstateSubaccount({
      organizationId: context.organization.id,
      id: row.id,
    });
    if (changed) {
      await audit(context, row, "subaccount.reinstated", {
        previous_status: row.reputationStatus,
      });
    }
    refresh();
    return null;
  });
}

export async function deleteSubaccountAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const context = await contextFor(formData, "delete");
    const row = await subaccountFromForm(context, formData);
    await deleteSubaccount({ organizationId: context.organization.id, id: row.id });
    await audit(context, row, "subaccount.deleted");
    return null;
  });
  if (!result.ok) return result;
  redirect(
    `/${formString(formData, "orgSlug")}/${formString(formData, "projectSlug")}/${formString(formData, "envSlug")}/email/subaccounts`,
  );
}
