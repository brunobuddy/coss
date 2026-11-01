"use server";

import {
  createSegment,
  deleteSegment,
  getSegment,
  previewSegmentContacts,
  updateSegment,
} from "@coss/email";
import { SegmentFilter, type SegmentFilterOutput } from "@coss/email/contact-schemas";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { auditMarketing, marketingTargetFromForm } from "@/lib/marketing";
import { requireOrgPermission } from "@/lib/session";

function filterFromForm(formData: FormData): SegmentFilterOutput {
  let json: unknown;
  try {
    json = JSON.parse(formString(formData, "filter"));
  } catch {
    throw new ActionError("The filter is not valid JSON.");
  }
  const parsed = SegmentFilter.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ActionError(`${issue?.path.join(".") || "Filter"}: ${issue?.message ?? "invalid."}`);
  }
  return parsed.data;
}

/** How many contacts the filter matches now, and a few of them. */
export async function previewSegmentAction(
  _previous: ActionResult<{ count: number; sample: string[] }> | null,
  formData: FormData,
): Promise<ActionResult<{ count: number; sample: string[] }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["read"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const preview = await previewSegmentContacts(
      target.env,
      filterFromForm(formData),
      { limit: 10 },
      { count: true },
    );
    return { count: preview.count ?? 0, sample: preview.data.map((contact) => contact.email) };
  });
}

/** Creates the segment, or updates the one named by `segmentId`, then opens it. */
export async function saveSegmentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const segmentId = formString(formData, "segmentId");
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: [segmentId ? "update" : "create"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const name = formString(formData, "name");
    if (!name || name.length > 200) throw new ActionError("Name: 1-200 characters.");
    const filter = filterFromForm(formData);
    const segment = segmentId
      ? await updateSegment(target.env, segmentId, { name, filter })
      : await createSegment(target.env, { name, filter });
    if (!segment) throw new ActionError("Segment not found.");
    await auditMarketing(target, {
      action: segmentId ? "segment.updated" : "segment.created",
      target: { type: "segment", id: segment.id, label: segment.name },
    });
    redirect(
      `/${context.organization.slug}/${formString(formData, "projectSlug")}/${formString(formData, "envSlug")}/marketing/segments/${segment.id}`,
    );
  });
}

export async function deleteSegmentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["delete"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const id = formString(formData, "segmentId");
    const segment = await getSegment(target.env, id);
    if (!segment || !(await deleteSegment(target.env, id))) {
      throw new ActionError("Segment not found.");
    }
    await auditMarketing(target, {
      action: "segment.deleted",
      target: { type: "segment", id, label: segment.name },
    });
    redirect(
      `/${context.organization.slug}/${formString(formData, "projectSlug")}/${formString(formData, "envSlug")}/marketing/segments`,
    );
  });
}
