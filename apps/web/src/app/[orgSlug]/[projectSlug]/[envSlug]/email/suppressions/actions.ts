"use server";

import {
  addSuppression,
  getSuppression,
  importSuppressions,
  parseSuppressionCsv,
  removeSuppression,
} from "@coss/email";
import { CreateSuppressionRequest, SuppressionScope } from "@coss/email/schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { type OrgContext, requireOrgPermission } from "@/lib/session";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, MAX_REPORTED_INVALID_ROWS } from "./import-limits";

/** The environment addressed by the form's slugs, inside the already-authorized organization. */
async function environmentFromForm(context: OrgContext, formData: FormData) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  return { organizationId: context.organization.id, environmentId: found.environment.id };
}

/** Records a change to this environment's settings in the organization's audit log. */
async function audit(
  context: OrgContext,
  formData: FormData,
  input: {
    action: string;
    target?: { type: string; id: string | null; label?: string | null };
    metadata?: Record<string, unknown>;
  },
) {
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  await recordAudit(context.session, {
    ...input,
    organizationId: context.organization.id,
    projectId: found?.project.id ?? null,
    environmentId: found?.environment.id ?? null,
  });
}

/** Adds an address for every email, or for one category when `category` is filled in. */
export async function addSuppressionAction(
  _previous: ActionResult<{ created: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ created: boolean }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      suppression: ["create"],
    });
    const env = await environmentFromForm(context, formData);
    const category = formString(formData, "category");
    const parsed = CreateSuppressionRequest.safeParse({
      address: formString(formData, "address"),
      scope: category || undefined,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] === "scope" ? "Category" : "Address";
      throw new ActionError(`${field}: ${issue?.message ?? "Invalid value."}`);
    }
    const result = await addSuppression(env, parsed.data);
    if (!result) throw new ActionError("Environment not found.");
    if (result.created) {
      await audit(context, formData, {
        action: "suppression.created",
        target: {
          type: "suppression",
          id: result.suppression.id,
          label: result.suppression.address,
        },
        metadata: { scope: result.suppression.scope },
      });
    }
    refresh();
    return { created: result.created };
  });
}

export async function removeSuppressionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      suppression: ["delete"],
    });
    const env = await environmentFromForm(context, formData);
    // Only an entry of this environment (and so of this organization) can be removed.
    const suppression = await getSuppression(env, formString(formData, "suppressionId"));
    if (!suppression || !(await removeSuppression(env, suppression.id))) {
      throw new ActionError("Suppression not found.");
    }
    await audit(context, formData, {
      action: "suppression.deleted",
      target: { type: "suppression", id: suppression.id, label: suppression.address },
      metadata: { scope: suppression.scope, reason: suppression.reason },
    });
    refresh();
    return null;
  });
}

export type ImportSuppressionsResult = {
  created: number;
  existing: number;
  invalidCount: number;
  /** The first skipped rows, by CSV line. */
  invalid: { line: number; address: string; message: string }[];
};

/**
 * Imports a CSV upload (an export of this list, another provider's export with an `email` column,
 * or one address per line). Rows without a scope get the form's `category`, or `*`.
 */
export async function importSuppressionsAction(
  _previous: ActionResult<ImportSuppressionsResult> | null,
  formData: FormData,
): Promise<ActionResult<ImportSuppressionsResult>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      suppression: ["create"],
    });
    const env = await environmentFromForm(context, formData);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose a CSV file.");
    if (file.size > MAX_IMPORT_BYTES) throw new ActionError("The file is larger than 2 MB.");
    let rows: ReturnType<typeof parseSuppressionCsv>;
    try {
      rows = parseSuppressionCsv(await file.text());
    } catch (error) {
      throw new ActionError(error instanceof Error ? error.message : "The file is not valid CSV.");
    }
    if (rows.length === 0) throw new ActionError("The file has no addresses.");
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ActionError(
        `The file has ${rows.length.toLocaleString("en-US")} rows; import at most ${MAX_IMPORT_ROWS.toLocaleString("en-US")} at a time.`,
      );
    }
    const category = formString(formData, "category") || undefined;
    if (category !== undefined && !SuppressionScope.safeParse(category).success) {
      throw new ActionError("Category: use ASCII letters, numbers, underscores or dashes.");
    }
    const result = await importSuppressions(
      env,
      rows.map((row) => ({ address: row.address, scope: row.scope ?? category })),
    );
    if (!result) throw new ActionError("Environment not found.");
    await audit(context, formData, {
      action: "suppression.imported",
      metadata: {
        file: file.name,
        created: result.created,
        existing: result.existing,
        invalid: result.invalid.length,
      },
    });
    if (result.created > 0) refresh();
    return {
      created: result.created,
      existing: result.existing,
      invalidCount: result.invalid.length,
      invalid: result.invalid.slice(0, MAX_REPORTED_INVALID_ROWS).map((entry) => ({
        line: rows[entry.index]?.line ?? 0,
        address: entry.address,
        message: entry.message,
      })),
    };
  });
}
