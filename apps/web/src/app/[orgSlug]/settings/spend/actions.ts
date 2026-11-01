"use server";

import {
  type BudgetScopeKind,
  checkOrganizationSpend,
  deleteBudget,
  parseDollarsToCents,
  setBudget,
} from "@coss/billing";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { systemOrganizationId } from "@/lib/billing";
import { requireOrgPermission } from "@/lib/session";

const SCOPES: readonly BudgetScopeKind[] = ["member_default", "user", "project", "api_key"];

function isScope(value: string): value is BudgetScopeKind {
  return (SCOPES as readonly string[]).includes(value);
}

/** Comma-separated whole percentages (`80, 100`); empty: the defaults. */
function parseThresholds(text: string): number[] | undefined {
  const values = text
    .split(",")
    .map((value) => value.trim().replace(/%$/, ""))
    .filter(Boolean)
    .map(Number);
  return values.length ? values : undefined;
}

/**
 * Checks the organization's budgets right away (the worker does it every few minutes), so a
 * raised budget resumes sending now. coss.com's own organization is never held.
 */
async function recheck(organizationId: string): Promise<void> {
  if (organizationId === (await systemOrganizationId())) return;
  try {
    await checkOrganizationSpend(organizationId, new Date());
  } catch (error) {
    // The worker's next check catches up; the change itself is saved.
    console.error(`[spend] checking ${organizationId} after a budget change failed:`, error);
  }
}

/**
 * Sets one budget: the member default, a member's own (or their exemption: `exempt=true`), a
 * project's or an API key's. Owners only (`billing:update`).
 */
export async function setBudgetAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      billing: ["update"],
    });
    const scope = formString(formData, "scope");
    if (!isScope(scope)) throw new ActionError("Choose what the budget is for.");
    const targetId = scope === "member_default" ? null : formString(formData, "targetId");
    if (scope !== "member_default" && !targetId) {
      throw new ActionError("Choose what the budget is for.");
    }
    const exempt = scope === "user" && formString(formData, "exempt") === "true";
    let amountCents: bigint | null = null;
    if (!exempt) {
      amountCents = parseDollarsToCents(formString(formData, "amount"));
      if (amountCents === null) {
        throw new ActionError("Enter the monthly budget in dollars, like 50 or 1,250.50.");
      }
    }
    const { budget, previous } = await setBudget({
      organizationId: organization.id,
      scope,
      targetId,
      amountCents,
      alertThresholds: parseThresholds(formString(formData, "alertThresholds")),
      actorUserId: session.user.id,
    });
    await recordAudit(session, {
      organizationId: organization.id,
      action: previous ? "billing.budget_updated" : "billing.budget_created",
      target: { type: "budget", id: budget.id, label: scope },
      projectId: budget.projectId,
      metadata: {
        scope,
        target_id: targetId,
        amount_cents: budget.amountCents?.toString() ?? null,
        previous_amount_cents: previous ? (previous.amountCents?.toString() ?? null) : undefined,
        alert_thresholds: budget.alertThresholds,
      },
    });
    await recheck(organization.id);
    refresh();
    return null;
  });
}

/** Removes a budget (a member's own: back to the default). */
export async function deleteBudgetAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      billing: ["update"],
    });
    const deleted = await deleteBudget({
      organizationId: organization.id,
      budgetId: formString(formData, "budgetId"),
    });
    if (!deleted) throw new ActionError("Budget not found.");
    await recordAudit(session, {
      organizationId: organization.id,
      action: "billing.budget_deleted",
      target: { type: "budget", id: deleted.id, label: deleted.scope },
      projectId: deleted.projectId,
      metadata: {
        scope: deleted.scope,
        target_id: deleted.userId ?? deleted.projectId ?? deleted.apiKeyId,
        amount_cents: deleted.amountCents?.toString() ?? null,
      },
    });
    await recheck(organization.id);
    refresh();
    return null;
  });
}
