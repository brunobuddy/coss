"use server";

import {
  addAudienceContacts,
  createContactProperty,
  deleteContact,
  deleteContactProperty,
  getContactRow,
  importContacts,
  listContactPropertyRows,
  parseContactCsv,
  removeAudienceContact,
  setContactTopics,
  updateContact,
  upsertContact,
} from "@coss/email";
import {
  type ContactPropertyValueOutput,
  CreateContactPropertyRequest,
  UpdateContactRequest,
  UpsertContactRequest,
} from "@coss/email/contact-schemas";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { planGate } from "@/lib/billing";
import { auditMarketing, marketingTargetFromForm } from "@/lib/marketing";
import { requireOrgPermission } from "@/lib/session";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  MAX_REPORTED_INVALID_ROWS,
} from "../../email/suppressions/import-limits";

const dashboard = { source: "dashboard" } as const;

function issueMessage(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  const field = issue?.path.join(".");
  return `${field ? `${field}: ` : ""}${issue?.message ?? "Invalid value."}`;
}

/** `true`/`false` (any case) or a finite number as its type; any other text stays text. */
function typedText(type: "number" | "boolean", text: string): string | number | boolean {
  if (type === "boolean") {
    const lower = text.trim().toLowerCase();
    return lower === "true" ? true : lower === "false" ? false : text;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}

/** The custom property fields of a form (`property:<key>`), typed by their definitions. */
async function propertiesFromForm(
  env: Parameters<typeof listContactPropertyRows>[0],
  formData: FormData,
): Promise<Record<string, ContactPropertyValueOutput>> {
  const properties: Record<string, ContactPropertyValueOutput> = {};
  for (const definition of await listContactPropertyRows(env)) {
    const name = `property:${definition.key}`;
    if (!formData.has(name)) continue;
    // A string property keeps its spaces (as through the API and CSV); the others are trimmed.
    const raw = formData.get(name);
    const text =
      definition.type === "string" && typeof raw === "string" ? raw : formString(formData, name);
    if (text === "") {
      properties[definition.key] = null;
    } else if (definition.type === "number" || definition.type === "boolean") {
      // Anything else is passed on as text, so validation names the property.
      properties[definition.key] = typedText(definition.type, text);
    } else {
      properties[definition.key] = text;
    }
  }
  return properties;
}

/** Adds a contact (or updates the one with the address). */
export async function addContactAction(
  _previous: ActionResult<{ created: boolean; id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ created: boolean; id: string }>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["create", "update"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const parsed = UpsertContactRequest.safeParse({
      email: formString(formData, "email"),
      first_name: formString(formData, "firstName") || undefined,
      last_name: formString(formData, "lastName") || undefined,
      status: formData.get("unsubscribed") === "on" ? "unsubscribed" : undefined,
    });
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
    const result = await upsertContact(target.env, parsed.data, {
      ...dashboard,
      plans: planGate(),
    });
    refresh();
    return { created: result.created, id: result.contact.id };
  });
}

/** Saves a contact's names, status and custom properties. */
export async function updateContactAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["update"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const status = formString(formData, "status");
    const parsed = UpdateContactRequest.safeParse({
      first_name: formString(formData, "firstName") || null,
      last_name: formString(formData, "lastName") || null,
      properties: await propertiesFromForm(target.env, formData),
      ...(status === "subscribed" || status === "unsubscribed" ? { status } : {}),
    });
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
    const updated = await updateContact(
      target.env,
      formString(formData, "contactId"),
      parsed.data,
      dashboard,
    );
    if (!updated) throw new ActionError("Contact not found.");
    refresh();
    return null;
  });
}

export async function deleteContactAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["delete"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const deleted = await deleteContact(target.env, formString(formData, "contactId"), dashboard);
    if (!deleted) throw new ActionError("Contact not found.");
    await auditMarketing(target, {
      action: "contact.deleted",
      target: { type: "contact", id: deleted.id, label: deleted.email },
    });
    redirect(
      `/${context.organization.slug}/${formString(formData, "projectSlug")}/${formString(formData, "envSlug")}/marketing/contacts`,
    );
  });
}

/** Records the contact's choice for one topic (`status`: `opted_in` or `opted_out`). */
export async function setContactTopicAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["update"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const status = formString(formData, "status");
    if (status !== "opted_in" && status !== "opted_out") throw new ActionError("Choose a status.");
    const topics = await setContactTopics(
      target.env,
      formString(formData, "contactId"),
      [{ topic: formString(formData, "topic"), status }],
      dashboard,
    );
    if (!topics) throw new ActionError("Contact not found.");
    refresh();
    return null;
  });
}

/** Adds the contact to an audience, or removes it (`intent=remove`). */
export async function contactAudienceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["update"],
    });
    const target = await marketingTargetFromForm(context, formData);
    // Only a contact of this environment.
    const contact = await getContactRow(target.env, formString(formData, "contactId"));
    if (!contact) throw new ActionError("Contact not found.");
    const audienceId = formString(formData, "audienceId");
    if (formString(formData, "intent") === "remove") {
      await removeAudienceContact(target.env, audienceId, contact.id);
    } else if (!(await addAudienceContacts(target.env, audienceId, [contact.id]))) {
      throw new ActionError("Audience not found.");
    }
    refresh();
    return null;
  });
}

export type ImportContactsResult = {
  created: number;
  updated: number;
  keptUnsubscribed: number;
  invalidCount: number;
  ignoredColumns: string[];
  invalid: { line: number; email: string; message: string }[];
};

/**
 * Imports a CSV upload (an export of these contacts, another tool's export with an `email`
 * column, or one address per line), optionally into an audience.
 */
export async function importContactsAction(
  _previous: ActionResult<ImportContactsResult> | null,
  formData: FormData,
): Promise<ActionResult<ImportContactsResult>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["create", "update"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose a CSV file.");
    if (file.size > MAX_IMPORT_BYTES) throw new ActionError("The file is larger than 2 MB.");
    const definitions = await listContactPropertyRows(target.env);
    let parsed: ReturnType<typeof parseContactCsv>;
    try {
      parsed = parseContactCsv(
        await file.text(),
        new Map(definitions.map((definition) => [definition.key, definition.type])),
      );
    } catch (error) {
      throw new ActionError(error instanceof Error ? error.message : "The file is not valid CSV.");
    }
    const rows = parsed.entries;
    if (rows.length === 0) throw new ActionError("The file has no contacts.");
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ActionError(
        `The file has ${rows.length.toLocaleString("en-US")} rows; import at most ${MAX_IMPORT_ROWS.toLocaleString("en-US")} at a time.`,
      );
    }
    // `none`: the select's "no audience" choice.
    const audienceId = formString(formData, "audienceId").replace(/^none$/, "");
    const result = await importContacts(
      target.env,
      rows.map((row) => row.entry),
      { plans: planGate(), source: "import", ...(audienceId ? { audienceId } : {}) },
    );
    await auditMarketing(target, {
      action: "contact.imported",
      metadata: {
        file: file.name,
        created: result.created,
        updated: result.updated,
        invalid: result.invalid.length,
      },
    });
    refresh();
    return {
      created: result.created,
      updated: result.updated,
      keptUnsubscribed: result.kept_unsubscribed,
      invalidCount: result.invalid.length,
      ignoredColumns: parsed.ignoredColumns,
      invalid: result.invalid.slice(0, MAX_REPORTED_INVALID_ROWS).map((entry) => ({
        line: rows[entry.index]?.line ?? 0,
        email: entry.email,
        message: entry.message,
      })),
    };
  });
}

export async function createContactPropertyAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["create"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const type = formString(formData, "type");
    const fallback = formString(formData, "fallback");
    const parsed = CreateContactPropertyRequest.safeParse({
      key: formString(formData, "key"),
      type,
      ...(fallback
        ? {
            fallback:
              type === "number" || type === "boolean" ? typedText(type, fallback) : fallback,
          }
        : {}),
    });
    if (!parsed.success) throw new ActionError(issueMessage(parsed.error));
    const property = await createContactProperty(target.env, parsed.data);
    await auditMarketing(target, {
      action: "contact_property.created",
      target: { type: "contact_property", id: property.id, label: property.key },
      metadata: { type: property.type },
    });
    refresh();
    return null;
  });
}

export async function deleteContactPropertyAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["delete"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const id = formString(formData, "propertyId");
    if (!(await deleteContactProperty(target.env, id))) {
      throw new ActionError("Property not found.");
    }
    await auditMarketing(target, {
      action: "contact_property.deleted",
      target: { type: "contact_property", id },
    });
    refresh();
    return null;
  });
}
