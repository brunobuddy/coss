"use server";

import { updateMarketingSettings } from "@coss/email";
import { UpdateMarketingSettingsRequest } from "@coss/email/contact-schemas";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { auditMarketing, marketingTargetFromForm } from "@/lib/marketing";
import { requireOrgPermission } from "@/lib/session";

export async function saveMarketingSettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      contact: ["update"],
    });
    const target = await marketingTargetFromForm(context, formData);
    const raw = (name: string) => {
      const value = formData.get(name);
      return (typeof value === "string" ? value.trim() : "") || null;
    };
    const parsed = UpdateMarketingSettingsRequest.safeParse({
      display_name: formString(formData, "displayName") || null,
      mailing_address: raw("mailingAddress"),
      double_opt_in_default: formData.get("doubleOptInDefault") === "on",
      confirmation_from: formString(formData, "confirmationFrom") || null,
      confirmation_subject: formString(formData, "confirmationSubject") || null,
      confirmation_html: raw("confirmationHtml"),
      confirmed_redirect_url: formString(formData, "confirmedRedirectUrl") || null,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ActionError(`${issue?.path.join(".")}: ${issue?.message ?? "Invalid value."}`);
    }
    await updateMarketingSettings(target.env, parsed.data);
    await auditMarketing(target, {
      action: "marketing_settings.updated",
      metadata: { fields: Object.keys(parsed.data) },
    });
    refresh();
    return null;
  });
}
