"use server";

import {
  approveBooking,
  type BookingActor,
  cancelBooking,
  createEventType,
  createHost,
  createHostSession,
  createSchedule,
  declineBooking,
  deleteHost,
  markNoShow,
  SchedulingError,
  updateEventType,
  updateHost,
  updateSettings,
} from "@coss/scheduling";
import { LOGO_MAX_BYTES } from "@coss/scheduling/branding";
import { Reminders } from "@coss/scheduling/schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { schedulingDeps, schedulingUrl } from "@/lib/scheduling";
import { type OrgContext, requireOrgPermission } from "@/lib/session";

type Permission = "create" | "read" | "update" | "delete";

async function contextFor(formData: FormData, action: Permission) {
  const context = await requireOrgPermission(formString(formData, "orgSlug"), {
    scheduling: [action],
  });
  const found = await getEnvironment({
    organizationId: context.organization.id,
    projectSlug: formString(formData, "projectSlug"),
    envSlug: formString(formData, "envSlug"),
  });
  if (!found) throw new ActionError("Environment not found.");
  const { environment } = found;
  return {
    context,
    env: {
      organizationId: context.organization.id,
      projectId: environment.projectId,
      environmentId: environment.id,
      mode: environment.mode,
    },
  };
}

function audit(
  context: OrgContext,
  action: string,
  target: { type: string; id: string; label?: string },
) {
  return recordAudit(context.session, {
    organizationId: context.organization.id,
    action,
    target,
  });
}

function configuredDeps() {
  const deps = schedulingDeps();
  if (!deps) throw new ActionError("Scheduling isn't available in this deployment yet.");
  return deps;
}

const actorOf = (context: OrgContext): BookingActor => ({
  kind: "user",
  id: context.session.user.id,
});

/** Product errors carry messages written for people. */
async function friendly<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SchedulingError) throw new ActionError(error.message);
    throw error;
  }
}

const FULL_WEEK_DAYS = [1, 2, 3, 4, 5];

export async function createHostAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "create");
    const email = formString(formData, "email");
    const phone = formString(formData, "phone");
    if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) {
      throw new ActionError("Enter the phone number with its country code, like +15551234567.");
    }
    const host = await friendly(() =>
      createHost(
        env,
        {
          name: formString(formData, "name"),
          time_zone: formString(formData, "timeZone"),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
        },
        { screen: configuredDeps().screenSetup },
      ),
    );
    await friendly(() =>
      createSchedule(env, host.id, {
        rules: [{ days: FULL_WEEK_DAYS, start: "09:00", end: "17:00" }],
      }),
    );
    await audit(context, "scheduling_host.created", {
      type: "scheduling_host",
      id: host.id,
      label: host.name,
    });
    refresh();
    return { id: host.id };
  });
}

export async function setHostStatusAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const id = formString(formData, "hostId");
    const status = formString(formData, "status") === "active" ? "active" : "disabled";
    const host = await friendly(() => updateHost(env, id, { status }));
    await audit(context, "scheduling_host.updated", {
      type: "scheduling_host",
      id: host.id,
      label: host.name,
    });
    refresh();
    return null;
  });
}

export async function deleteHostAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "delete");
    const { id } = await friendly(() => deleteHost(env, formString(formData, "hostId")));
    await audit(context, "scheduling_host.deleted", { type: "scheduling_host", id });
    refresh();
    return null;
  });
}

/** A short-lived link to a host's page. The token's in its fragment, and shown only here. */
export async function openHostPortalAction(
  _prev: ActionResult<{ url: string }> | null,
  formData: FormData,
) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const publicUrl = schedulingUrl();
    if (!publicUrl) throw new ActionError("The hosted scheduling pages aren't set up yet.");
    const session = await friendly(() =>
      createHostSession(env, {
        host: formString(formData, "hostId"),
        createdByUserId: context.session.user.id,
        publicUrl,
      }),
    );
    return { url: session.url as string };
  });
}

export async function createEventTypeAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "create");
    const hostId = formString(formData, "hostId");
    const kind = formString(formData, "kind") === "pool" ? "pool" : "one_on_one";
    const duration = Number(formString(formData, "duration"));
    if (!Number.isInteger(duration) || duration < 5 || duration > 1440) {
      throw new ActionError("Enter a duration from 5 to 1440 minutes.");
    }
    const eventType = await friendly(() =>
      createEventType(
        env,
        {
          title: formString(formData, "title"),
          kind,
          duration_minutes: duration,
          hosts: hostId ? [{ host: hostId, role: "member", weight: 100, schedule: null }] : [],
        },
        { screen: configuredDeps().screenSetup },
      ),
    );
    await audit(context, "scheduling_event_type.created", {
      type: "scheduling_event_type",
      id: eventType.id,
      label: eventType.title,
    });
    refresh();
    return { id: eventType.id };
  });
}

export async function cancelBookingAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const booking = await friendly(() =>
      cancelBooking(env, formString(formData, "bookingId"), configuredDeps(), actorOf(context)),
    );
    await audit(context, "scheduling_booking.cancelled", {
      type: "scheduling_booking",
      id: booking.id,
    });
    refresh();
    return null;
  });
}

export async function approveBookingAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const booking = await friendly(() =>
      approveBooking(env, formString(formData, "bookingId"), configuredDeps(), actorOf(context)),
    );
    await audit(context, "scheduling_booking.approved", {
      type: "scheduling_booking",
      id: booking.id,
    });
    refresh();
    return null;
  });
}

export async function declineBookingAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const booking = await friendly(() =>
      declineBooking(env, formString(formData, "bookingId"), configuredDeps(), actorOf(context)),
    );
    await audit(context, "scheduling_booking.declined", {
      type: "scheduling_booking",
      id: booking.id,
    });
    refresh();
    return null;
  });
}

export async function markNoShowAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const booking = await friendly(() =>
      markNoShow(env, formString(formData, "bookingId"), configuredDeps(), actorOf(context)),
    );
    await audit(context, "scheduling_booking.no_show", {
      type: "scheduling_booking",
      id: booking.id,
    });
    refresh();
    return null;
  });
}

/** A whole list at a time, for the environment or one event type; `null` goes back to inheriting. */
export async function saveRemindersAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const eventTypeId = formString(formData, "eventTypeId");
    const raw: unknown = JSON.parse(formString(formData, "reminders"));
    const parsed = raw === null ? null : Reminders.safeParse(raw);
    if (parsed && !parsed.success) {
      throw new ActionError(parsed.error.issues[0]?.message ?? "This reminder isn't valid.");
    }
    const reminders = parsed ? parsed.data : null;
    const deps = configuredDeps();
    const checks = { screen: deps.screenSetup, verifiedAddress: deps.verifiedAddress };
    if (eventTypeId) {
      const eventType = await friendly(() =>
        updateEventType(env, eventTypeId, { reminders }, checks),
      );
      await audit(context, "scheduling_event_type.updated", {
        type: "scheduling_event_type",
        id: eventType.id,
        label: eventType.title,
      });
    } else {
      await friendly(() => updateSettings(env, { reminders }, checks));
      await audit(context, "scheduling_settings.updated", {
        type: "scheduling_settings",
        id: env.environmentId,
      });
    }
    refresh();
    return null;
  });
}

export async function saveSettingsAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const origins = formString(formData, "allowedOrigins")
      .split(/[\s,]+/)
      .filter(Boolean);
    const brandName = formString(formData, "brandName");
    const emailFrom = formString(formData, "emailFrom");
    const emailReplyTo = formString(formData, "emailReplyTo");
    const smsFrom = formString(formData, "smsFrom");
    const accentColor = formString(formData, "accentColor");
    const useAccent = formString(formData, "useAccentColor") === "on";
    if (useAccent && !/^#[0-9a-f]{6}$/i.test(accentColor)) {
      throw new ActionError("Choose an accent color.");
    }
    const upload = formData.get("logo");
    const newLogo = upload instanceof File && upload.size > 0 ? upload : null;
    if (newLogo && newLogo.size > LOGO_MAX_BYTES) {
      throw new ActionError("A logo can be 200 KB at most.");
    }
    await friendly(async () =>
      updateSettings(
        env,
        {
          allowed_origins: origins,
          brand_name: brandName || null,
          accent_color: useAccent ? accentColor : null,
          ...(newLogo
            ? { logo: { content: Buffer.from(await newLogo.arrayBuffer()).toString("base64") } }
            : formString(formData, "removeLogo") === "on"
              ? { logo: null }
              : {}),
          email_from: emailFrom || null,
          email_reply_to: emailReplyTo || null,
          sms_from: smsFrom || null,
          calendar_failure_mode:
            formString(formData, "calendarFailureMode") === "last_known" ? "last_known" : "hide",
        },
        {
          screen: configuredDeps().screenSetup,
          verifiedAddress: configuredDeps().verifiedAddress,
        },
      ),
    );
    await audit(context, "scheduling_settings.updated", {
      type: "scheduling_settings",
      id: env.environmentId,
    });
    refresh();
    return null;
  });
}
