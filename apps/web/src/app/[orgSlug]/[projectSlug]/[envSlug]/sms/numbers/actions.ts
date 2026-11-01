"use server";

import { BillingError } from "@coss/billing";
import { orgLinkHref } from "@coss/dashboard-routes";
import {
  type AvailableNumber,
  buySmsNumber,
  createSmsRegistration,
  listSmsNumbers,
  releaseSmsNumber,
  SmsError,
  searchSmsNumbers,
  setAllowedSmsCountries,
  setSmsNumberReceivingEnvironment,
} from "@coss/sms";
import { SmsRegistrationInput } from "@coss/sms/schemas";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { requireOrgPermission } from "@/lib/session";
import { smsSenderDeps } from "@/lib/sms";
import { registerSenderHref } from "@/lib/sms-registration";

function sharedLink(orgSlug: string, to: string | null): string | null {
  return to ? orgLinkHref(orgSlug, to) : null;
}

/** SMS and plan refusals carry messages written for customers. */
async function friendly<T>(body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof SmsError || error instanceof BillingError) {
      throw new ActionError(error.message);
    }
    throw error;
  }
}

export async function searchNumbersAction(
  _previous: ActionResult<AvailableNumber[]> | null,
  formData: FormData,
): Promise<ActionResult<AvailableNumber[]>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      smsSender: ["create"],
    });
    const kind = formString(formData, "kind") === "toll_free" ? "toll_free" : "local";
    const country = formString(formData, "country") === "CA" ? "CA" : "US";
    const areaCode = formString(formData, "areaCode");
    if (areaCode && !/^\d{3}$/.test(areaCode)) throw new ActionError("Area codes have 3 digits.");
    return friendly(() =>
      searchSmsNumbers(
        context.organization.id,
        { kind, country, areaCode: areaCode || undefined },
        smsSenderDeps(),
      ),
    );
  });
}

/** A bought number and where to register its sender (`null`: nothing to register yet). */
export type BoughtNumber = {
  phoneNumber: string;
  kind: "local" | "toll_free";
  registerHref: string | null;
};

export async function buyNumberAction(
  _previous: ActionResult<BoughtNumber> | null,
  formData: FormData,
): Promise<ActionResult<BoughtNumber>> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      smsSender: ["create"],
    });
    const number = await friendly(() =>
      buySmsNumber(
        context.organization.id,
        {
          phoneNumber: formString(formData, "phoneNumber"),
          kind: formString(formData, "kind") === "toll_free" ? "toll_free" : "local",
          receivingEnvironmentId: formString(formData, "receivingEnvironmentId") || null,
        },
        smsSenderDeps(),
      ),
    );
    await recordAudit(context.session, {
      action: "sms_number.created",
      organizationId: context.organization.id,
      projectId: null,
      environmentId: null,
      target: { type: "sms_number", id: number.id, label: number.phoneNumber },
      metadata: { kind: number.kind },
    });
    // Read back with its registration: a local number joins a 10DLC registration already under way.
    const bought = (await listSmsNumbers(context.organization.id)).find(
      (row) => row.number.id === number.id,
    );
    refresh();
    return {
      phoneNumber: number.phoneNumber,
      kind: number.kind,
      registerHref: bought
        ? sharedLink(
            context.organization.slug,
            registerSenderHref(bought.number, bought.registration?.status ?? null),
          )
        : null,
    };
  });
}

export async function releaseNumberAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      smsSender: ["delete"],
    });
    const numberId = formString(formData, "numberId");
    await friendly(() => releaseSmsNumber(context.organization.id, numberId, smsSenderDeps()));
    await recordAudit(context.session, {
      action: "sms_number.deleted",
      organizationId: context.organization.id,
      projectId: null,
      environmentId: null,
      target: { type: "sms_number", id: numberId, label: formString(formData, "phoneNumber") },
    });
    refresh();
    return null;
  });
}

export async function setReceivingEnvironmentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      smsSender: ["update"],
    });
    const numberId = formString(formData, "numberId");
    const environmentId = formString(formData, "environmentId") || null;
    await friendly(() =>
      setSmsNumberReceivingEnvironment(context.organization.id, numberId, environmentId),
    );
    await recordAudit(context.session, {
      action: "sms_number.updated",
      organizationId: context.organization.id,
      projectId: null,
      environmentId: null,
      target: { type: "sms_number", id: numberId, label: formString(formData, "phoneNumber") },
      metadata: { receiving_environment_id: environmentId },
    });
    refresh();
    return null;
  });
}

export async function setCountriesAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      smsSender: ["update"],
    });
    const countries = formData.getAll("country").map(String);
    if (countries.length === 0) throw new ActionError("Allow at least one country.");
    const account = await friendly(() =>
      setAllowedSmsCountries(context.organization.id, countries),
    );
    await recordAudit(context.session, {
      action: "sms_countries.updated",
      organizationId: context.organization.id,
      projectId: null,
      environmentId: null,
      metadata: { countries: account.allowedCountries },
    });
    refresh();
    return null;
  });
}

/** Submits a registration (the form posts its fields as JSON); the worker does the rest. */
export async function createRegistrationAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const orgSlug = formString(formData, "orgSlug");
  const result = await runAction<string>(async () => {
    const context = await requireOrgPermission(orgSlug, { smsSender: ["create"] });
    let raw: unknown;
    try {
      raw = JSON.parse(formString(formData, "registration"));
    } catch {
      throw new ActionError("The form couldn't be read. Reload the page and try again.");
    }
    const parsed = SmsRegistrationInput.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ActionError(
        `${issue?.path.join(".") || "Form"}: ${issue?.message ?? "Invalid value."}`,
      );
    }
    const registration = await friendly(() =>
      createSmsRegistration(context.organization.id, parsed.data, smsSenderDeps()),
    );
    await recordAudit(context.session, {
      action: "sms_registration.created",
      organizationId: context.organization.id,
      projectId: null,
      environmentId: null,
      target: { type: "sms_registration", id: registration.id, label: registration.kind },
    });
    return registration.id;
  });
  // The SMS page shows what was submitted and what happens next.
  if (result.ok)
    redirect(orgLinkHref(orgSlug, `/sms/numbers?registered=${encodeURIComponent(result.data)}`));
  return result;
}
