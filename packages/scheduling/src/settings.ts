/** An environment's scheduling settings; a row exists once something is changed. */
import { db, schema } from "@coss/db";
import { and, eq } from "drizzle-orm";
import { SchedulingError } from "./errors.ts";
import { getLogoRow, logoDataUrl, removeLogo, type SchedulingLogoRow, saveLogo } from "./logo.ts";
import { policyFromWire, policyToWire } from "./notification-policy.ts";
import {
  checkReminders,
  normalizeReminders,
  queueReminderSync,
  type ReminderChecks,
} from "./reminders.ts";
import type { SettingsObjectOutput, UpdateSettingsRequestOutput } from "./schemas.ts";
import { refuseLinks, screenSetup } from "./screening.ts";
import type { SchedulingEnvironment } from "./types.ts";

const { schedulingSettings } = schema;

type SettingsRow = typeof schedulingSettings.$inferSelect;
type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;

function toSettingsObject(
  row: SettingsRow | undefined,
  logo: SchedulingLogoRow | null,
): SettingsObjectOutput {
  return {
    object: "scheduling.settings",
    allowed_origins: row?.allowedOrigins ?? [],
    brand_name: row?.brandName ?? null,
    accent_color: row?.accentColor ?? null,
    logo: logo
      ? {
          content_type: logo.contentType as "image/png" | "image/jpeg",
          width: logo.width,
          height: logo.height,
          data_url: logoDataUrl(logo),
        }
      : null,
    email_from: row?.emailFrom ?? null,
    sms_from: row?.smsFrom ?? null,
    calendar_failure_mode: row?.calendarFailureMode ?? "hide",
    notifications: policyToWire(row?.notifications),
    email_reply_to: row?.emailReplyTo ?? null,
    reminders: row?.reminders ?? null,
  };
}

/** `https://host[:port]`, or also localhost in a sandbox. */
export function checkedOrigin(value: string, mode: "live" | "sandbox"): string {
  const refused = new SchedulingError(
    "invalid_event_type",
    `"${value}" isn't an https origin, like https://app.example.com.`,
    { param: "allowed_origins" },
  );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw refused;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const allowed = url.protocol === "https:" || (mode === "sandbox" && local);
  if (!allowed || url.origin !== value.replace(/\/$/, "")) throw refused;
  return url.origin;
}

export async function getSettingsRow(scope: Scope): Promise<SettingsRow | undefined> {
  const [row] = await db
    .select()
    .from(schedulingSettings)
    .where(
      and(
        eq(schedulingSettings.organizationId, scope.organizationId),
        eq(schedulingSettings.environmentId, scope.environmentId),
      ),
    );
  return row;
}

export async function getSettings(scope: Scope): Promise<SettingsObjectOutput> {
  const [row, logo] = await Promise.all([getSettingsRow(scope), getLogoRow(scope)]);
  return toSettingsObject(row, logo);
}

export async function updateSettings(
  env: SchedulingEnvironment,
  params: UpdateSettingsRequestOutput,
  opts: ReminderChecks = {},
): Promise<SettingsObjectOutput> {
  refuseLinks(params.brand_name, "brand_name");
  if (params.brand_name) await screenSetup(env, params.brand_name, opts.screen, "brand_name");
  const reminders = params.reminders ? normalizeReminders(params.reminders) : params.reminders;
  const existing =
    reminders || params.email_from !== undefined ? await getSettingsRow(env) : undefined;
  const emailFrom = params.email_from !== undefined ? params.email_from : existing?.emailFrom;
  // Changing `email_from` is checked too: the list may count on the one being taken away.
  const list =
    reminders ??
    (reminders === undefined && emailFrom !== existing?.emailFrom ? existing?.reminders : null);
  if (list) await checkReminders(env, list, emailFrom, opts);
  if (params.logo) await saveLogo(env, params.logo.content);
  else if (params.logo === null) await removeLogo(env);
  const values = {
    ...(params.allowed_origins !== undefined
      ? { allowedOrigins: params.allowed_origins.map((origin) => checkedOrigin(origin, env.mode)) }
      : {}),
    ...(params.brand_name !== undefined ? { brandName: params.brand_name } : {}),
    ...(params.accent_color !== undefined ? { accentColor: params.accent_color } : {}),
    ...(params.email_from !== undefined ? { emailFrom: params.email_from } : {}),
    ...(params.email_reply_to !== undefined ? { emailReplyTo: params.email_reply_to } : {}),
    ...(reminders !== undefined ? { reminders } : {}),
    ...(params.sms_from !== undefined ? { smsFrom: params.sms_from } : {}),
    ...(params.calendar_failure_mode !== undefined
      ? { calendarFailureMode: params.calendar_failure_mode }
      : {}),
    ...(params.notifications !== undefined
      ? { notifications: policyFromWire(params.notifications) }
      : {}),
  };
  const row = await db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(schedulingSettings)
      .values({
        organizationId: env.organizationId,
        projectId: env.projectId,
        environmentId: env.environmentId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [schedulingSettings.environmentId],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    // Clearing a policy can bring the default reminder back, as much as setting one can.
    if (reminders !== undefined || params.notifications !== undefined) {
      await queueReminderSync(tx, env, null);
    }
    return saved;
  });
  return toSettingsObject(row, await getLogoRow(env));
}
