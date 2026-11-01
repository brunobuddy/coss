"use server";

import { authorizeLiveSender } from "@coss/email";
import { getEnvironment } from "@coss/tenancy";
import {
  MAX_APP_NAME_LENGTH,
  MAX_ATTEMPTS_LIMIT,
  MAX_CODE_LENGTH,
  MAX_TTL_SECONDS,
  MIN_CODE_LENGTH,
  MIN_TTL_SECONDS,
  updateVerifySettings,
  VerifyError,
} from "@coss/verify";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { emailRuntime } from "@/lib/email-runtime";
import { requireOrgPermission } from "@/lib/session";

function integer(formData: FormData, name: string, min: number, max: number, label: string) {
  const value = Number(formString(formData, name).trim());
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ActionError(`${label} must be between ${min} and ${max}.`);
  }
  return value;
}

export async function saveVerifySettingsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const context = await requireOrgPermission(formString(formData, "orgSlug"), {
      verify: ["update"],
    });
    const found = await getEnvironment({
      organizationId: context.organization.id,
      projectSlug: formString(formData, "projectSlug"),
      envSlug: formString(formData, "envSlug"),
    });
    if (!found) throw new ActionError("Environment not found.");
    const { environment } = found;

    const appName = formString(formData, "appName").trim();
    if (appName.length > MAX_APP_NAME_LENGTH) {
      throw new ActionError(`The app name can be at most ${MAX_APP_NAME_LENGTH} characters.`);
    }
    const smsFrom = formString(formData, "smsFrom").trim();
    const emailFrom = formString(formData, "emailFrom").trim();
    const countries = [
      ...new Set(
        formString(formData, "allowedCountries")
          .toUpperCase()
          .split(/[\s,]+/)
          .filter(Boolean),
      ),
    ];
    if (countries.some((country) => !/^[A-Z]{2}$/.test(country))) {
      throw new ActionError("Countries are two-letter codes, like US, CA or GB.");
    }
    const ttlMinutes = integer(
      formData,
      "ttlMinutes",
      MIN_TTL_SECONDS / 60,
      MAX_TTL_SECONDS / 60,
      "Codes' lifetime in minutes",
    );
    try {
      const settings = await updateVerifySettings(
        { organizationId: context.organization.id, environmentId: environment.id },
        {
          app_name: appName || null,
          code_length: integer(
            formData,
            "codeLength",
            MIN_CODE_LENGTH,
            MAX_CODE_LENGTH,
            "Code length",
          ),
          ttl_seconds: ttlMinutes * 60,
          max_attempts: integer(formData, "maxAttempts", 1, MAX_ATTEMPTS_LIMIT, "Attempts"),
          sms_from: smsFrom || null,
          email_from: emailFrom || null,
          allowed_countries: countries,
        },
        {
          checkEmailFrom: (organizationId, address) =>
            authorizeLiveSender({
              organizationId,
              from: address,
              provider: emailRuntime().domainDeps.identity.name,
            }).then(
              () => true,
              () => false,
            ),
        },
      );
      await recordAudit(context.session, {
        organizationId: context.organization.id,
        action: "verify_settings.updated",
        target: { type: "environment", id: environment.id, label: environment.name },
        projectId: environment.projectId,
        environmentId: environment.id,
        metadata: {
          sms_from: settings.smsFrom,
          email_from: settings.emailFrom,
          allowed_countries: settings.allowedCountries,
        },
      });
    } catch (error) {
      if (error instanceof VerifyError) throw new ActionError(error.message);
      throw error;
    }
    refresh();
    return null;
  });
}
