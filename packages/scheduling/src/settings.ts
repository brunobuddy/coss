/** An environment's scheduling settings; a row exists once something is changed. */
import { db, schema } from "@coss/db";
import { and, eq } from "drizzle-orm";
import { SchedulingError } from "./errors.ts";
import { getLogoRow, logoDataUrl, removeLogo, type SchedulingLogoRow, saveLogo } from "./logo.ts";
import type { SettingsObjectOutput, UpdateSettingsRequestOutput } from "./schemas.ts";
import { refuseLinks, type SetupScreening, screenSetup } from "./screening.ts";
import type { SchedulingEnvironment } from "./types.ts";

const { schedulingSettings } = schema;

type SettingsRow = typeof schedulingSettings.$inferSelect;
type Scope = Pick<SchedulingEnvironment, "organizationId" | "environmentId">;

function toWireNotifications(row: SettingsRow | undefined): SettingsObjectOutput["notifications"] {
  if (!row?.notifications) return null;
  return Object.fromEntries(
    Object.entries(row.notifications).map(([event, policy]) => [
      event,
      {
        ...(policy.emailAttendee !== undefined ? { email_attendee: policy.emailAttendee } : {}),
        ...(policy.emailHost !== undefined ? { email_host: policy.emailHost } : {}),
        ...(policy.smsAttendee !== undefined ? { sms_attendee: policy.smsAttendee } : {}),
      },
    ]),
  );
}

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
    notifications: toWireNotifications(row),
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
  opts: { screen?: SetupScreening | undefined } = {},
): Promise<SettingsObjectOutput> {
  refuseLinks(params.brand_name, "brand_name");
  if (params.brand_name) await screenSetup(env, params.brand_name, opts.screen, "brand_name");
  if (params.logo) await saveLogo(env, params.logo.content);
  else if (params.logo === null) await removeLogo(env);
  const values = {
    ...(params.allowed_origins !== undefined
      ? { allowedOrigins: params.allowed_origins.map((origin) => checkedOrigin(origin, env.mode)) }
      : {}),
    ...(params.brand_name !== undefined ? { brandName: params.brand_name } : {}),
    ...(params.accent_color !== undefined ? { accentColor: params.accent_color } : {}),
    ...(params.email_from !== undefined ? { emailFrom: params.email_from } : {}),
    ...(params.sms_from !== undefined ? { smsFrom: params.sms_from } : {}),
    ...(params.calendar_failure_mode !== undefined
      ? { calendarFailureMode: params.calendar_failure_mode }
      : {}),
    ...(params.notifications !== undefined
      ? {
          notifications: params.notifications
            ? Object.fromEntries(
                Object.entries(params.notifications).map(([event, policy]) => [
                  event,
                  {
                    ...(policy.email_attendee !== undefined
                      ? { emailAttendee: policy.email_attendee }
                      : {}),
                    ...(policy.email_host !== undefined ? { emailHost: policy.email_host } : {}),
                    ...(policy.sms_attendee !== undefined
                      ? { smsAttendee: policy.sms_attendee }
                      : {}),
                  },
                ]),
              )
            : null,
        }
      : {}),
  };
  const [row] = await db
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
  return toSettingsObject(row, await getLogoRow(env));
}
