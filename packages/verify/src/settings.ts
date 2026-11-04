/**
 * An environment's Verify settings (`verify_settings`, one row per environment, created on the
 * first change): the name codes are sent for, code length, lifetime and attempts, the senders and
 * the countries SMS codes may go to.
 */
import { db, schema } from "@coss/db";
import { and, eq } from "drizzle-orm";
import { VerifyError } from "./errors.ts";
import {
  DEFAULT_VERIFY_SETTINGS,
  type UpdateVerifySettingsRequestOutput,
  type VerifySettingsWire,
} from "./schemas.ts";

const { environment, project, smsNumber, verifySettings } = schema;

export type VerifyScope = { organizationId: string; environmentId: string };

export type ResolvedVerifySettings = {
  /** The settings' name, else the project's. */
  appName: string;
  /** Whether `appName` is the project's (the settings name none). */
  appNameIsDefault: boolean;
  codeLength: number;
  ttlSeconds: number;
  maxAttempts: number;
  /** One of the organization's numbers; `null`: coss.com's shared numbers. */
  smsFrom: string | null;
  /** `null`: coss.com's sender. */
  emailFrom: string | null;
  allowedCountries: string[];
};

/** The environment's settings with defaults filled in; `null` if it isn't the organization's. */
export async function getVerifySettings(
  scope: VerifyScope,
): Promise<ResolvedVerifySettings | null> {
  const [row] = await db
    .select({ projectName: project.name, settings: verifySettings })
    .from(environment)
    .innerJoin(
      project,
      and(
        eq(project.id, environment.projectId),
        eq(project.organizationId, environment.organizationId),
      ),
    )
    .leftJoin(
      verifySettings,
      and(
        eq(verifySettings.environmentId, environment.id),
        eq(verifySettings.organizationId, environment.organizationId),
      ),
    )
    .where(
      and(
        eq(environment.id, scope.environmentId),
        eq(environment.organizationId, scope.organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const settings = row.settings;
  return {
    appName: settings?.appName ?? row.projectName,
    appNameIsDefault: !settings?.appName,
    codeLength: settings?.codeLength ?? DEFAULT_VERIFY_SETTINGS.codeLength,
    ttlSeconds: settings?.ttlSeconds ?? DEFAULT_VERIFY_SETTINGS.ttlSeconds,
    maxAttempts: settings?.maxAttempts ?? DEFAULT_VERIFY_SETTINGS.maxAttempts,
    smsFrom: settings?.smsFrom ?? null,
    emailFrom: settings?.emailFrom ?? null,
    allowedCountries: settings?.allowedCountries ?? [...DEFAULT_VERIFY_SETTINGS.allowedCountries],
  };
}

export function toVerifySettingsObject(settings: ResolvedVerifySettings): VerifySettingsWire {
  return {
    object: "verify_settings",
    app_name: settings.appName,
    app_name_is_default: settings.appNameIsDefault,
    code_length: settings.codeLength,
    ttl_seconds: settings.ttlSeconds,
    max_attempts: settings.maxAttempts,
    sms_from: settings.smsFrom,
    email_from: settings.emailFrom,
    allowed_countries: settings.allowedCountries,
  };
}

export type UpdateVerifySettingsOptions = {
  /**
   * Whether the address may send from a live environment (a verified domain of the organization;
   * the dashboard and the API check with `@coss/email`). Sandbox environments accept any.
   */
  checkEmailFrom?: (organizationId: string, address: string) => Promise<boolean>;
};

/** Changes the fields given; `sms_from` must be one of the organization's numbers. */
export async function updateVerifySettings(
  scope: VerifyScope,
  params: UpdateVerifySettingsRequestOutput,
  opts: UpdateVerifySettingsOptions = {},
): Promise<ResolvedVerifySettings> {
  const [env] = await db
    .select({ projectId: environment.projectId, mode: environment.mode })
    .from(environment)
    .where(
      and(
        eq(environment.id, scope.environmentId),
        eq(environment.organizationId, scope.organizationId),
      ),
    )
    .limit(1);
  if (!env) throw new VerifyError("not_found", "Environment not found.");
  if (params.sms_from) {
    const [number] = await db
      .select({ id: smsNumber.id })
      .from(smsNumber)
      .where(
        and(
          eq(smsNumber.organizationId, scope.organizationId),
          eq(smsNumber.phoneNumber, params.sms_from),
        ),
      )
      .limit(1);
    if (!number) {
      throw new VerifyError("invalid_settings", "That number isn't one of your organization's.", {
        param: "sms_from",
      });
    }
  }
  if (params.email_from && env.mode === "live" && opts.checkEmailFrom) {
    if (!(await opts.checkEmailFrom(scope.organizationId, params.email_from))) {
      throw new VerifyError(
        "invalid_settings",
        "The sender must be on one of your organization's verified domains.",
        { param: "email_from" },
      );
    }
  }
  const changes = {
    ...(params.app_name !== undefined ? { appName: params.app_name } : {}),
    ...(params.code_length !== undefined ? { codeLength: params.code_length } : {}),
    ...(params.ttl_seconds !== undefined ? { ttlSeconds: params.ttl_seconds } : {}),
    ...(params.max_attempts !== undefined ? { maxAttempts: params.max_attempts } : {}),
    ...(params.sms_from !== undefined ? { smsFrom: params.sms_from } : {}),
    ...(params.email_from !== undefined
      ? { emailFrom: params.email_from?.toLowerCase() ?? null }
      : {}),
    ...(params.allowed_countries !== undefined
      ? { allowedCountries: [...new Set(params.allowed_countries)].sort() }
      : {}),
  };
  await db
    .insert(verifySettings)
    .values({
      organizationId: scope.organizationId,
      projectId: env.projectId,
      environmentId: scope.environmentId,
      ...changes,
    })
    .onConflictDoUpdate({
      target: verifySettings.environmentId,
      set: { ...changes, updatedAt: new Date() },
    });
  const resolved = await getVerifySettings(scope);
  if (!resolved) throw new VerifyError("not_found", "Environment not found.");
  return resolved;
}
