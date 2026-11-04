"use server";

import {
  approveBooking,
  type BookingActor,
  cancelBooking,
  createBookerSession,
  createEventType,
  createHost,
  createHostSession,
  createManageSession,
  createSchedule,
  declineBooking,
  deleteHost,
  getEventType,
  getHost,
  markNoShow,
  SchedulingError,
  updateEventType,
  updateHost,
  updateSettings,
} from "@coss/scheduling";
import { LOGO_MAX_BYTES } from "@coss/scheduling/branding";
import {
  EVENT_TYPE_KINDS,
  Reminders,
  UpdateEventTypeRequest,
  UpdateHostLocationsRequest,
  UpdateHostRequest,
} from "@coss/scheduling/schemas";
import { getEnvironment } from "@coss/tenancy";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { schedulingDeps, schedulingUrl } from "@/lib/scheduling";
import { eventTypeChanges, issueLabel, parseJsonObject } from "@/lib/scheduling-edit";
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

/** JSON a person typed: `null` when left blank, and the message says which field is wrong. */
function readJson(text: string, label: string): Record<string, unknown> | null {
  try {
    return parseJsonObject(text, label);
  } catch (error) {
    throw new ActionError((error as Error).message);
  }
}

type Parsed<T> = { success: true; data: T } | { success: false; error: { issues: Issue[] } };
type Issue = { path: readonly PropertyKey[]; message: string };

/** A schema's verdict, with its first complaint in the form's own words. */
function checked<T>(result: Parsed<T>): T {
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new ActionError(
    issue ? `${issueLabel(issue.path)}: ${issue.message}` : "The form has a mistake.",
  );
}

function publicUrlOrThrow(): string {
  const publicUrl = schedulingUrl();
  if (!publicUrl) throw new ActionError("The hosted scheduling pages aren't set up yet.");
  return publicUrl;
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

export async function updateHostLocationsAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const address = formString(formData, "address").trim();
    const url = formString(formData, "url").trim();
    const number = formString(formData, "number").trim();
    const parsed = UpdateHostLocationsRequest.safeParse({
      locations: [
        ...(address ? [{ type: "in_person", address }] : []),
        ...(url ? [{ type: "link", url }] : []),
        ...(number ? [{ type: "phone", number }] : []),
      ],
    });
    if (!parsed.success) {
      throw new ActionError(parsed.error.issues[0]?.message ?? "Check these locations.");
    }
    const host = await friendly(() =>
      updateHost(env, formString(formData, "hostId"), parsed.data, {
        screen: configuredDeps().screenSetup,
      }),
    );
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
    // From its own page, there's nothing left to come back to.
    if (formString(formData, "leavePage") === "on") {
      const slugs = ["orgSlug", "projectSlug", "envSlug"].map((name) => formString(formData, name));
      redirect(`/${slugs.join("/")}/scheduling/hosts`);
    }
    refresh();
    return null;
  });
}

export async function updateHostAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const id = formString(formData, "hostId");
    const current = await friendly(() => getHost(env, id));
    const name = formString(formData, "name");
    const email = formString(formData, "email") || null;
    const phone = formString(formData, "phone") || null;
    const uid = formString(formData, "uid") || null;
    const timeZone = formString(formData, "timeZone");
    // Only what changed: a name goes through screening. The schema is the API's, so a blank name or
    // time zone is refused here too.
    const update = checked(
      UpdateHostRequest.safeParse({
        ...(name !== current.name.trim() ? { name } : {}),
        ...(email !== (current.email?.trim() || null) ? { email } : {}),
        ...(phone !== (current.phone?.trim() || null) ? { phone } : {}),
        ...(uid !== (current.uid?.trim() || null) ? { uid } : {}),
        ...(timeZone !== current.time_zone ? { time_zone: timeZone } : {}),
        attributes: readJson(formString(formData, "attributes"), "Attributes") ?? {},
        metadata: readJson(formString(formData, "metadata"), "Metadata") ?? {},
      }),
    );
    const host = await friendly(() =>
      updateHost(env, id, update, { screen: configuredDeps().screenSetup }),
    );
    await audit(context, "scheduling_host.updated", {
      type: "scheduling_host",
      id: host.id,
      label: host.name,
    });
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
    const publicUrl = publicUrlOrThrow();
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

/**
 * A booking is made on the booker's page, not here: working out what's bookable only runs in the
 * API (`packages/scheduling/AGENTS.md`, "Slots"), so the dashboard opens the same page attendees use.
 */
export async function openBookerAction(
  _prev: ActionResult<{ url: string }> | null,
  formData: FormData,
) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "create");
    const publicUrl = publicUrlOrThrow();
    const session = await friendly(() =>
      createBookerSession(
        env,
        {
          eventType: formString(formData, "eventTypeId"),
          createdByUserId: context.session.user.id,
          publicUrl,
        },
        configuredDeps(),
      ),
    );
    return { url: session.url as string };
  });
}

/** As `openBookerAction`: moving a booking checks what's free, which only the API does. */
export async function openBookingManagerAction(
  _prev: ActionResult<{ url: string }> | null,
  formData: FormData,
) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const publicUrl = publicUrlOrThrow();
    const session = await friendly(() =>
      createManageSession(env, {
        bookingId: formString(formData, "bookingId"),
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
    const kind = EVENT_TYPE_KINDS.find((value) => value === formString(formData, "kind"));
    if (!kind) throw new ActionError("Choose what kind of event type this is.");
    const duration = Number(formString(formData, "duration"));
    if (!Number.isInteger(duration) || duration < 5 || duration > 1440) {
      throw new ActionError("Enter a duration from 5 to 1440 minutes.");
    }
    const where = formString(formData, "where");
    const capacity = kind === "group" ? Number(formString(formData, "capacity")) : null;
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 2 || capacity > 10000)) {
      throw new ActionError("Enter a capacity from 2 to 10000 attendees.");
    }
    const eventType = await friendly(() =>
      createEventType(
        env,
        {
          title: formString(formData, "title"),
          kind,
          duration_minutes: duration,
          ...(capacity !== null ? { capacity } : {}),
          hosts: hostId
            ? [
                {
                  host: hostId,
                  role: kind === "collective" ? "required" : "member",
                  weight: 100,
                  schedule: null,
                },
              ]
            : [],
          // Left blank, so each booking takes its host's own.
          ...(where === "in_person"
            ? { locations: [{ type: "in_person" as const, address: null }] }
            : where === "link"
              ? { locations: [{ type: "link" as const, url: null }] }
              : where === "phone"
                ? { locations: [{ type: "phone" as const, number: null }] }
                : {}),
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

export async function updateEventTypeAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const id = formString(formData, "eventTypeId");
    let raw: unknown;
    try {
      raw = JSON.parse(formString(formData, "payload"));
    } catch {
      throw new ActionError("The form couldn't be read. Reload the page and try again.");
    }
    const current = await friendly(() => getEventType(env, id));
    const filter = formData.get("hostFilter");
    const update = checked(
      UpdateEventTypeRequest.safeParse({
        ...(raw as object),
        metadata: readJson(formString(formData, "metadata"), "Metadata") ?? {},
        // Only a pool's form has this field, and an event type's kind never changes.
        ...(typeof filter === "string"
          ? { host_filter: readJson(filter, "Attributes to include") }
          : {}),
      }),
    );
    const changes = eventTypeChanges(current, update);
    if (Object.keys(changes).length === 0) return null;
    const eventType = await friendly(() =>
      updateEventType(env, id, changes, { screen: configuredDeps().screenSetup }),
    );
    await audit(context, "scheduling_event_type.updated", {
      type: "scheduling_event_type",
      id: eventType.id,
      label: eventType.title,
    });
    refresh();
    return null;
  });
}

export async function setEventTypeStatusAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const status = formString(formData, "status") === "active" ? "active" : "archived";
    const eventType = await friendly(() =>
      updateEventType(env, formString(formData, "eventTypeId"), { status }),
    );
    await audit(context, "scheduling_event_type.updated", {
      type: "scheduling_event_type",
      id: eventType.id,
      label: eventType.title,
    });
    refresh();
    return null;
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
