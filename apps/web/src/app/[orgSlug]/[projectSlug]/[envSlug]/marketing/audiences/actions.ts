"use server";

import {
  addAudienceContacts,
  createAudience,
  deleteAudience,
  getAudience,
  removeAudienceContact,
  updateAudience,
} from "@coss/email";
import {
  CreateAudienceRequest,
  MAX_AUDIENCE_CONTACTS_PER_REQUEST,
} from "@coss/email/contact-schemas";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { auditMarketing, marketingTargetFromForm } from "@/lib/marketing";
import { requireOrgPermission } from "@/lib/session";

function audienceName(formData: FormData): string {
  const parsed = CreateAudienceRequest.safeParse({ name: formString(formData, "name") });
  if (!parsed.success) throw new ActionError("Name: 1-200 characters.");
  return parsed.data.name;
}

export async function createAudienceAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["create"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const audience = await createAudience(target.env, { name: audienceName(formData) });
    await auditMarketing(target, {
      action: "audience.created",
      target: { type: "audience", id: audience.id, label: audience.name },
    });
    refresh();
    return { id: audience.id };
  });
}

export async function renameAudienceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["update"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const audience = await updateAudience(target.env, formString(formData, "audienceId"), {
      name: audienceName(formData),
    });
    if (!audience) throw new ActionError("Audience not found.");
    await auditMarketing(target, {
      action: "audience.updated",
      target: { type: "audience", id: audience.id, label: audience.name },
    });
    refresh();
    return null;
  });
}

export async function deleteAudienceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["delete"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const id = formString(formData, "audienceId");
    const audience = await getAudience(target.env, id);
    if (!audience || !(await deleteAudience(target.env, id))) {
      throw new ActionError("Audience not found.");
    }
    await auditMarketing(target, {
      action: "audience.deleted",
      target: { type: "audience", id, label: audience.name },
    });
    redirect(
      `/${context.organization.slug}/${formString(formData, "projectSlug")}/${formString(formData, "envSlug")}/marketing/audiences`,
    );
  });
}

/** Adds existing contacts by address (one per line, or separated by commas or spaces). */
export async function addAudienceMembersAction(
  _previous: ActionResult<{ added: number; existing: number; missing: string[] }> | null,
  formData: FormData,
): Promise<ActionResult<{ added: number; existing: number; missing: string[] }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["update"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const contacts = formString(formData, "contacts")
      .split(/[\s,;]+/)
      .filter(Boolean);
    if (contacts.length === 0) throw new ActionError("Enter at least one address.");
    if (contacts.length > MAX_AUDIENCE_CONTACTS_PER_REQUEST) {
      throw new ActionError(`Add at most ${MAX_AUDIENCE_CONTACTS_PER_REQUEST} at a time.`);
    }
    const result = await addAudienceContacts(
      target.env,
      formString(formData, "audienceId"),
      contacts,
    );
    if (!result) throw new ActionError("Audience not found.");
    refresh();
    return { added: result.added, existing: result.existing, missing: result.missing };
  });
}

export async function removeAudienceMemberAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["update"],
    });
    const target = await marketingTargetFromForm(context, formData);
    if (
      !(await removeAudienceContact(
        target.env,
        formString(formData, "audienceId"),
        formString(formData, "contactId"),
      ))
    ) {
      throw new ActionError("The contact isn't a member.");
    }
    refresh();
    return null;
  });
}
