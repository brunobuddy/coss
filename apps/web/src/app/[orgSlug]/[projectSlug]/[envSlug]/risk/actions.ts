"use server";

import {
  addRiskListEntry,
  createRiskLimitBucket,
  createRiskRule,
  deleteRiskLimitBucket,
  deleteRiskRule,
  getRiskListEntry,
  RiskError,
  recordRiskFeedback,
  removeRiskListEntry,
  updateRiskLimitBucket,
  updateRiskRule,
  updateRiskSettings,
} from "@coss/risk";
import {
  CONTENT_CATEGORIES,
  CreateRiskFeedbackRequest,
  CreateRiskLimitBucketRequest,
  CreateRiskListEntryRequest,
  CreateRiskRuleRequest,
  type RiskOutcome,
  UpdateRiskLimitBucketRequest,
  UpdateRiskRuleRequest,
  UpdateRiskSettingsRequest,
} from "@coss/risk/schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { riskHasher } from "@/lib/risk";
import { type OrgContext, requireOrgPermission } from "@/lib/session";
import { webhookManagementDeps } from "@/lib/webhooks";

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return {
    scope: { organizationId: context.organization.id, environmentId: found.environment.id },
    projectId: found.project.id,
  };
}

/** Records an outcome for an assessment of this environment (also resolves an open review). */
export async function recordRiskFeedbackAction(
  _previous: ActionResult<{ outcome: RiskOutcome }> | null,
  formData: FormData,
): Promise<ActionResult<{ outcome: RiskOutcome }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      risk: ["feedback"],
    });
    const { scope, projectId } = await environmentFromForm(context, formData);
    const parsed = CreateRiskFeedbackRequest.safeParse({
      outcome: formString(formData, "outcome"),
      note: formString(formData, "note") || undefined,
    });
    if (!parsed.success)
      throw new ActionError("Choose an outcome (notes are at most 500 characters).");
    // Only an assessment of this environment (and so of this organization) can be changed.
    const assessment = await recordRiskFeedback(
      riskHasher(),
      scope,
      formString(formData, "assessmentId"),
      parsed.data,
      { source: "dashboard", actorId: context.session.user.id },
    );
    if (!assessment) throw new ActionError("Assessment not found.");
    await recordAudit(context.session, {
      action: "risk_assessment.feedback",
      organizationId: scope.organizationId,
      projectId,
      environmentId: scope.environmentId,
      target: { type: "risk_assessment", id: assessment.id },
      metadata: { outcome: parsed.data.outcome },
    });
    refresh();
    return { outcome: parsed.data.outcome };
  });
}

export async function addRiskListEntryAction(
  _previous: ActionResult<{ created: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ created: boolean }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      riskList: ["create"],
    });
    const { scope, projectId } = await environmentFromForm(context, formData);
    const parsed = CreateRiskListEntryRequest.safeParse({
      list: formString(formData, "list"),
      type: formString(formData, "type"),
      value: formString(formData, "value"),
      note: formString(formData, "note") || undefined,
    });
    if (!parsed.success) {
      throw new ActionError(parsed.error.issues[0]?.message ?? "Check the entry.");
    }
    let result: Awaited<ReturnType<typeof addRiskListEntry>>;
    try {
      result = await addRiskListEntry(scope, parsed.data);
    } catch (error) {
      if (error instanceof RiskError) throw new ActionError(error.message);
      throw error;
    }
    if (!result) throw new ActionError("Environment not found.");
    if (result.created) {
      await recordAudit(context.session, {
        action: "risk_list_entry.created",
        organizationId: scope.organizationId,
        projectId,
        environmentId: scope.environmentId,
        target: { type: "risk_list_entry", id: result.entry.id, label: result.entry.value },
        metadata: { list: result.entry.list, type: result.entry.type },
      });
      refresh();
    }
    return { created: result.created };
  });
}

export async function removeRiskListEntryAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      riskList: ["delete"],
    });
    const { scope, projectId } = await environmentFromForm(context, formData);
    const entry = await getRiskListEntry(scope, formString(formData, "entryId"));
    if (!entry || !(await removeRiskListEntry(scope, entry.id))) {
      throw new ActionError("List entry not found.");
    }
    await recordAudit(context.session, {
      action: "risk_list_entry.deleted",
      organizationId: scope.organizationId,
      projectId,
      environmentId: scope.environmentId,
      target: { type: "risk_list_entry", id: entry.id, label: entry.value },
      metadata: { list: entry.list, type: entry.type },
    });
    refresh();
    return null;
  });
}

/** The first validation message, prefixed with the field it is about. */
function issueMessage(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  if (!issue) return "Check the form.";
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Runs a risk operation, turning its expected errors into messages for the form. */
async function riskCall<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RiskError) throw new ActionError(error.message);
    throw error;
  }
}

export async function updateRiskSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      risk: ["update"],
    });
    const { scope, projectId } = await environmentFromForm(context, formData);
    const provider = formString(formData, "captchaProvider");
    const secret = formString(formData, "captchaSecret");
    const parsed = UpdateRiskSettingsRequest.safeParse({
      review_threshold: Number(formString(formData, "reviewThreshold")),
      block_threshold: Number(formString(formData, "blockThreshold")),
      disabled_reasons: formData.getAll("disabledReasons").map(String),
      captcha:
        provider === "none"
          ? null
          : {
              provider,
              ...(secret ? { secret } : {}),
              required: formData.get("captchaRequired") === "on",
            },
      // An empty field removes the category's threshold.
      content_thresholds: Object.fromEntries(
        CONTENT_CATEGORIES.map((category) => {
          const value = formString(formData, `contentThreshold.${category}`);
          return [category, value ? Number(value) : null];
        }),
      ),
    });
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
    const settings = await riskCall(() =>
      updateRiskSettings(scope, parsed.data, webhookManagementDeps().secretsKeys),
    );
    if (!settings) throw new ActionError("Environment not found.");
    await recordAudit(context.session, {
      action: "risk_settings.updated",
      organizationId: scope.organizationId,
      projectId,
      environmentId: scope.environmentId,
      target: { type: "risk_settings", id: scope.environmentId },
      // Never the captcha secret.
      metadata: { captcha: settings.captcha?.provider ?? null, secret_changed: Boolean(secret) },
    });
    refresh();
    return null;
  });
}

/**
 * Sets reason weights from the calibration page: `weights` (JSON) maps codes to a weight, or to
 * `null` to restore the default.
 */
export async function applyRiskReasonWeightsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      risk: ["update"],
    });
    const { scope, projectId } = await environmentFromForm(context, formData);
    let weights: unknown;
    try {
      weights = JSON.parse(formString(formData, "weights"));
    } catch {
      throw new ActionError("The weights could not be read. Reload the page and try again.");
    }
    const parsed = UpdateRiskSettingsRequest.safeParse({ reason_weights: weights });
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
    const settings = await riskCall(() =>
      updateRiskSettings(scope, parsed.data, webhookManagementDeps().secretsKeys),
    );
    if (!settings) throw new ActionError("Environment not found.");
    await recordAudit(context.session, {
      action: "risk_settings.updated",
      organizationId: scope.organizationId,
      projectId,
      environmentId: scope.environmentId,
      target: { type: "risk_settings", id: scope.environmentId },
      metadata: { reason_weights: parsed.data.reason_weights ?? {} },
    });
    refresh();
    return null;
  });
}

/** The rule builder posts its rule as JSON (`rule`). */
function ruleFromForm(formData: FormData): unknown {
  try {
    return JSON.parse(formString(formData, "rule"));
  } catch {
    throw new ActionError("The rule could not be read. Reload the page and try again.");
  }
}

export async function saveRiskRuleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ruleId = formString(formData, "ruleId");
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      riskRule: [ruleId ? "update" : "create"],
    });
    const { scope, projectId } = await environmentFromForm(context, formData);
    const body = ruleFromForm(formData);
    const audit = (action: string, rule: { id: string; name: string }) =>
      recordAudit(context.session, {
        action,
        organizationId: scope.organizationId,
        projectId,
        environmentId: scope.environmentId,
        target: { type: "risk_rule", id: rule.id, label: rule.name },
      });
    if (ruleId) {
      const parsed = UpdateRiskRuleRequest.safeParse(body);
      if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
      // Only a rule of this environment (and so of this organization) can be changed.
      const rule = await updateRiskRule(scope, ruleId, parsed.data);
      if (!rule) throw new ActionError("Rule not found.");
      await audit("risk_rule.updated", rule);
    } else {
      const parsed = CreateRiskRuleRequest.safeParse(body);
      if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
      const rule = await riskCall(() => createRiskRule(scope, parsed.data));
      if (!rule) throw new ActionError("Environment not found.");
      await audit("risk_rule.created", rule);
    }
    refresh();
    return null;
  });
}

export async function toggleRiskRuleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      riskRule: ["update"],
    });
    const { scope, projectId } = await environmentFromForm(context, formData);
    const enabled = formString(formData, "enabled") === "true";
    const rule = await updateRiskRule(scope, formString(formData, "ruleId"), { enabled });
    if (!rule) throw new ActionError("Rule not found.");
    await recordAudit(context.session, {
      action: "risk_rule.updated",
      organizationId: scope.organizationId,
      projectId,
      environmentId: scope.environmentId,
      target: { type: "risk_rule", id: rule.id, label: rule.name },
      metadata: { enabled },
    });
    refresh();
    return null;
  });
}

export async function deleteRiskRuleAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      riskRule: ["delete"],
    });
    const { scope, projectId } = await environmentFromForm(context, formData);
    const rule = await deleteRiskRule(scope, formString(formData, "ruleId"));
    if (!rule) throw new ActionError("Rule not found.");
    await recordAudit(context.session, {
      action: "risk_rule.deleted",
      organizationId: scope.organizationId,
      projectId,
      environmentId: scope.environmentId,
      target: { type: "risk_rule", id: rule.id, label: rule.name },
    });
    refresh();
    return null;
  });
}

/** Creates a rate limit bucket, or (with `bucketId`) updates one; its name can't change. */
export async function saveRiskLimitBucketAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      risk: ["update"],
    });
    const { scope, projectId } = await environmentFromForm(context, formData);
    const bucketId = formString(formData, "bucketId");
    const numbers = {
      limit: Number(formString(formData, "limit")),
      period_seconds: Number(formString(formData, "periodSeconds")),
      ...(formString(formData, "burst") ? { burst: Number(formString(formData, "burst")) } : {}),
      on_failure: formString(formData, "onFailure"),
    };
    const audit = (action: string, bucket: { id: string; name: string }) =>
      recordAudit(context.session, {
        action,
        organizationId: scope.organizationId,
        projectId,
        environmentId: scope.environmentId,
        target: { type: "risk_limit_bucket", id: bucket.id, label: bucket.name },
      });
    if (bucketId) {
      const parsed = UpdateRiskLimitBucketRequest.safeParse(numbers);
      if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
      // Only a bucket of this environment (and so of this organization) can be changed.
      const bucket = await updateRiskLimitBucket(scope, bucketId, parsed.data);
      if (!bucket) throw new ActionError("Bucket not found.");
      await audit("risk_limit_bucket.updated", bucket);
    } else {
      const parsed = CreateRiskLimitBucketRequest.safeParse({
        name: formString(formData, "name"),
        ...numbers,
      });
      if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
      const bucket = await riskCall(() => createRiskLimitBucket(scope, parsed.data));
      if (!bucket) throw new ActionError("Environment not found.");
      await audit("risk_limit_bucket.created", bucket);
    }
    refresh();
    return null;
  });
}

export async function deleteRiskLimitBucketAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      risk: ["update"],
    });
    const { scope, projectId } = await environmentFromForm(context, formData);
    const bucket = await deleteRiskLimitBucket(scope, formString(formData, "bucketId"));
    if (!bucket) throw new ActionError("Bucket not found.");
    await recordAudit(context.session, {
      action: "risk_limit_bucket.deleted",
      organizationId: scope.organizationId,
      projectId,
      environmentId: scope.environmentId,
      target: { type: "risk_limit_bucket", id: bucket.id, label: bucket.name },
    });
    refresh();
    return null;
  });
}
