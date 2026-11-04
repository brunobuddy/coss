"use server";

import {
  approveBooking,
  type BookingActor,
  cancelBooking,
  cancelReassignment,
  createEventType,
  createHost,
  createHostSession,
  createOutOfOffice,
  createReassignment,
  createSchedule,
  declineBooking,
  deleteHost,
  deleteOutOfOffice,
  previewReassignment,
  reassignBooking,
  SchedulingError,
  undoReassignment,
  updateHost,
  updateSettings,
} from "@coss/scheduling";
import { LOGO_MAX_BYTES } from "@coss/scheduling/branding";
import {
  CreateReassignmentRequest,
  ReassignBookingRequest,
  type ReassignmentObjectOutput,
  type ReassignmentPreviewOutput,
  UndoReassignmentRequest,
} from "@coss/scheduling/schemas";
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
    const host = await friendly(() =>
      createHost(
        env,
        {
          name: formString(formData, "name"),
          time_zone: formString(formData, "timeZone"),
          ...(email ? { email } : {}),
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

export async function reassignBookingAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const toHost = formString(formData, "toHost");
    if (!toHost) throw new ActionError("Choose who it goes to.");
    const fromHost = formString(formData, "fromHost");
    const note = formString(formData, "note");
    const parsed = ReassignBookingRequest.safeParse({
      changes: [{ to_host: toHost, ...(fromHost ? { from_host: fromHost } : {}) }],
      reason_code: formString(formData, "reasonCode"),
      ...(note ? { note } : {}),
      overrides: formString(formData, "overrides").split(",").filter(Boolean),
      notify: { attendee: formData.get("notifyAttendee") === "on" },
    });
    if (!parsed.success) throw new ActionError("That doesn't look right. Please try again.");
    const booking = await friendly(() =>
      reassignBooking(
        env,
        formString(formData, "bookingId"),
        parsed.data,
        configuredDeps(),
        actorOf(context),
      ),
    );
    await audit(context, "scheduling_booking.reassigned", {
      type: "scheduling_booking",
      id: booking.id,
    });
    refresh();
    return null;
  });
}

export async function createOutOfOfficeAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "create");
    const hosts = formData.getAll("hostId").map(String);
    if (hosts.length === 0) throw new ActionError("Choose at least one host.");
    const optional = (name: string) => formString(formData, name) || undefined;
    const startDate = optional("startDate");
    const entries = await friendly(() =>
      createOutOfOffice(
        env,
        {
          hosts,
          // A browser's times come as instants, since only it knows which zone they were typed in.
          ...(startDate
            ? { start_date: startDate, end_date: optional("endDate") ?? startDate }
            : { start: formString(formData, "start"), end: formString(formData, "end") }),
          reason: optional("reason"),
          public_message: optional("publicMessage"),
          notes: optional("notes"),
          show_on_calendar: formData.get("showOnCalendar") === "on",
          existing_bookings: formData.get("moveBookings") === "on" ? "reassign" : "leave",
          delegates: formData.getAll("delegateId").map(String),
        },
        configuredDeps(),
        actorOf(context),
        "dashboard",
      ),
    );
    for (const entry of entries) {
      await audit(context, "scheduling_out_of_office.created", {
        type: "scheduling_out_of_office",
        id: entry.id,
      });
    }
    refresh();
    return null;
  });
}

/** A read, so it's allowed to whoever can change what it shows, and it doesn't toast. */
export async function previewReassignmentAction(
  _prev: ActionResult<ReassignmentPreviewOutput> | null,
  formData: FormData,
) {
  return runAction(async () => {
    const { env } = await contextFor(formData, "update");
    const entry = formString(formData, "outOfOfficeId");
    const host = formString(formData, "fromHost");
    if (!entry && !host) throw new ActionError("Choose whose bookings.");
    const before = formString(formData, "startBefore");
    const preferred = formString(formData, "preferredHost");
    return friendly(() =>
      previewReassignment(
        env,
        {
          selection: {
            ...(entry ? { out_of_office: entry } : { host }),
            ...(before ? { start_before: before } : {}),
          },
          strategy: preferred ? { preferred_hosts: [preferred] } : {},
        },
        configuredDeps(),
      ),
    );
  });
}

export async function startReassignmentAction(
  _prev: ActionResult<ReassignmentObjectOutput> | null,
  formData: FormData,
) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    let assignments: unknown;
    try {
      assignments = JSON.parse(formString(formData, "assignments"));
    } catch {
      throw new ActionError("That doesn't look right. Please try again.");
    }
    const note = formString(formData, "note");
    const parsed = CreateReassignmentRequest.safeParse({
      selection: {},
      strategy: { assignments },
      reason_code: formString(formData, "reasonCode"),
      ...(note ? { note } : {}),
      notify: { attendees: formData.get("notifyAttendees") === "on" },
    });
    if (!parsed.success) throw new ActionError("That doesn't look right. Please try again.");
    const { reassignment } = await friendly(() =>
      createReassignment(env, parsed.data, configuredDeps(), actorOf(context)),
    );
    await audit(context, "scheduling_reassignment.created", {
      type: "scheduling_reassignment",
      id: reassignment.id,
    });
    refresh();
    return reassignment;
  });
}

export async function cancelReassignmentAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const row = await friendly(() =>
      cancelReassignment(env, formString(formData, "reassignmentId"), configuredDeps()),
    );
    await audit(context, "scheduling_reassignment.cancelled", {
      type: "scheduling_reassignment",
      id: row.id,
    });
    refresh();
    return null;
  });
}

export async function undoReassignmentAction(
  _prev: ActionResult<ReassignmentObjectOutput> | null,
  formData: FormData,
) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const parsed = UndoReassignmentRequest.safeParse({
      notify: { attendees: formData.get("notifyAttendees") === "on" },
    });
    if (!parsed.success) throw new ActionError("That doesn't look right. Please try again.");
    const row = await friendly(() =>
      undoReassignment(
        env,
        formString(formData, "reassignmentId"),
        parsed.data,
        configuredDeps(),
        actorOf(context),
      ),
    );
    await audit(context, "scheduling_reassignment.undone", {
      type: "scheduling_reassignment",
      id: row.id,
    });
    refresh();
    return row;
  });
}

export async function deleteOutOfOfficeAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "delete");
    const { id } = await friendly(() =>
      deleteOutOfOffice(env, formString(formData, "entryId"), configuredDeps()),
    );
    await audit(context, "scheduling_out_of_office.deleted", {
      type: "scheduling_out_of_office",
      id,
    });
    refresh();
    return null;
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

export async function saveSettingsAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const origins = formString(formData, "allowedOrigins")
      .split(/[\s,]+/)
      .filter(Boolean);
    const brandName = formString(formData, "brandName");
    const emailFrom = formString(formData, "emailFrom");
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
          sms_from: smsFrom || null,
          calendar_failure_mode:
            formString(formData, "calendarFailureMode") === "last_known" ? "last_known" : "hide",
        },
        { screen: configuredDeps().screenSetup },
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
