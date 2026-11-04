"use server";

import {
  approveBooking,
  type BookingActor,
  cancelBooking,
  cancelReassignment,
  createBookerSession,
  createCalendarDelegation,
  createDashboardSession,
  createEventType,
  createHolidayCalendar,
  createHost,
  createHostSession,
  createManageSession,
  createSchedule,
  declineBooking,
  deleteCalendarDelegation,
  deleteHolidayCalendar,
  deleteHost,
  deleteOutOfOffice,
  getEventType,
  getHost,
  SchedulingError,
  undoReassignment,
  updateCalendarDelegation,
  updateEventType,
  updateHost,
  updateSettings,
  verifyCalendarDelegation,
} from "@coss/scheduling";
import { LOGO_MAX_BYTES } from "@coss/scheduling/branding";
import {
  CreateHolidayCalendarRequest,
  EVENT_TYPE_KINDS,
  type ReassignmentObjectOutput,
  UndoReassignmentRequest,
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
import { planGate } from "@/lib/billing";
import { usageGate } from "@/lib/broadcasts";
import { schedulingCalendarDeps, schedulingDeps, schedulingUrl } from "@/lib/scheduling";
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

/** A date from a date input, as the end of that day in UTC. */
function secretExpiry(formData: FormData): string | undefined {
  const value = formString(formData, "secretExpiresAt");
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59Z`);
  if (Number.isNaN(date.getTime())) throw new ActionError("That expiry date isn't valid.");
  return date.toISOString();
}

const delegationDeps = () => ({ ...schedulingCalendarDeps(), plans: planGate() });

export async function createDelegationAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const domain = formString(formData, "domain").trim().toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
      throw new ActionError("Enter a domain, like example.com.");
    }
    const matchHostEmail = formString(formData, "matchHostEmail") === "on";
    const secretExpiresAt = secretExpiry(formData);
    const delegation = await friendly(() =>
      createCalendarDelegation(
        env,
        formString(formData, "provider") === "microsoft"
          ? {
              provider: "microsoft",
              domain,
              match_host_email: matchHostEmail,
              tenant_id: formString(formData, "tenantId").trim(),
              client_id: formString(formData, "clientId").trim(),
              client_secret: formString(formData, "clientSecret"),
              ...(secretExpiresAt ? { secret_expires_at: secretExpiresAt } : {}),
            }
          : {
              provider: "google",
              domain,
              match_host_email: matchHostEmail,
              service_account_key: formString(formData, "serviceAccountKey"),
            },
        delegationDeps(),
      ),
    );
    await audit(context, "scheduling_calendar_delegation.created", {
      type: "scheduling_calendar_delegation",
      id: delegation.id,
      label: delegation.domain,
    });
    refresh();
    return null;
  });
}

export async function verifyDelegationAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const delegation = await friendly(() =>
      verifyCalendarDelegation(
        env,
        formString(formData, "delegationId"),
        { account: formString(formData, "account") },
        delegationDeps(),
      ),
    );
    await audit(context, "scheduling_calendar_delegation.verified", {
      type: "scheduling_calendar_delegation",
      id: delegation.id,
      label: delegation.domain,
    });
    refresh();
    return null;
  });
}

export async function updateDelegationAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const serviceAccountKey = formString(formData, "serviceAccountKey");
    const clientSecret = formString(formData, "clientSecret");
    const secretExpiresAt = secretExpiry(formData);
    const delegation = await friendly(() =>
      updateCalendarDelegation(
        env,
        formString(formData, "delegationId"),
        {
          match_host_email: formString(formData, "matchHostEmail") === "on",
          ...(serviceAccountKey ? { service_account_key: serviceAccountKey } : {}),
          ...(clientSecret ? { client_secret: clientSecret } : {}),
          // Only Microsoft's form has it, and there an empty date clears it.
          ...(formData.has("secretExpiresAt")
            ? { secret_expires_at: secretExpiresAt ?? null }
            : {}),
        },
        delegationDeps(),
      ),
    );
    await audit(context, "scheduling_calendar_delegation.updated", {
      type: "scheduling_calendar_delegation",
      id: delegation.id,
      label: delegation.domain,
    });
    refresh();
    return null;
  });
}

export async function deleteDelegationAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const { id } = await friendly(() =>
      deleteCalendarDelegation(env, formString(formData, "delegationId"), {}),
    );
    await audit(context, "scheduling_calendar_delegation.deleted", {
      type: "scheduling_calendar_delegation",
      id,
    });
    refresh();
    return null;
  });
}

export async function createHostAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "create");
    const email = formString(formData, "email");
    const billing = await usageGate();
    const host = await friendly(() =>
      createHost(
        env,
        {
          name: formString(formData, "name"),
          time_zone: formString(formData, "timeZone"),
          ...(email ? { email } : {}),
        },
        {
          screen: configuredDeps().screenSetup,
          plans: configuredDeps().plans,
          billing,
        },
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

export async function createHolidayCalendarAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "create");
    const hosts = formData.getAll("hostId").map(String);
    if (hosts.length === 0) throw new ActionError("Choose at least one host.");
    const country = formString(formData, "country");
    const icsUrl = formString(formData, "icsUrl");
    const parsed = CreateHolidayCalendarRequest.safeParse({
      name: formString(formData, "name"),
      ...(icsUrl ? { ics_url: icsUrl } : { country }),
      hosts,
      delegates: formData.getAll("delegateId").map(String),
      existing_bookings: formData.get("moveBookings") === "on" ? "reassign" : "leave",
    });
    if (!parsed.success) throw new ActionError("That doesn't look right. Please try again.");
    const calendar = await friendly(() =>
      // A feed's address can hold a token, so it's encrypted with what calendars' credentials are.
      createHolidayCalendar(env, parsed.data, {
        ...configuredDeps(),
        calendars: schedulingCalendarDeps(),
      }),
    );
    await audit(context, "scheduling_holiday_calendar.created", {
      type: "scheduling_holiday_calendar",
      id: calendar.id,
    });
    refresh();
    return null;
  });
}

export async function deleteHolidayCalendarAction(_prev: ActionResult | null, formData: FormData) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "delete");
    const removed = await friendly(() =>
      deleteHolidayCalendar(env, formString(formData, "calendarId"), configuredDeps()),
    );
    await audit(context, "scheduling_holiday_calendar.deleted", {
      type: "scheduling_holiday_calendar",
      id: removed.id,
    });
    refresh();
    return null;
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
    const billing = await usageGate();
    const { id } = await friendly(() =>
      deleteHost(env, formString(formData, "hostId"), { billing }),
    );
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
    const uid = formString(formData, "uid") || null;
    const timeZone = formString(formData, "timeZone");
    // Only what changed: a name goes through screening. The schema is the API's, so a blank name or
    // time zone is refused here too.
    const update = checked(
      UpdateHostRequest.safeParse({
        ...(name !== current.name.trim() ? { name } : {}),
        ...(email !== (current.email?.trim() || null) ? { email } : {}),
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

/**
 * Who's away and moving bookings, across this environment. That means knowing who's free and what
 * time a date means, which only runs in the API (`packages/scheduling/AGENTS.md`, "Slots"), so the
 * dashboard opens the page that calls it. Worth a line in the audit log, since it reaches every host.
 */
export async function openTeamPageAction(
  _prev: ActionResult<{ url: string }> | null,
  formData: FormData,
) {
  return runAction(async () => {
    const { context, env } = await contextFor(formData, "update");
    const publicUrl = publicUrlOrThrow();
    const session = await friendly(() =>
      createDashboardSession(env, { createdByUserId: context.session.user.id, publicUrl }),
    );
    await audit(context, "scheduling_team_page.opened", {
      type: "environment",
      id: env.environmentId,
    });
    const focus = new URLSearchParams();
    for (const [name, param] of [
      ["tab", "tab"],
      ["bookingId", "booking"],
      ["outOfOfficeId", "out_of_office"],
    ] as const) {
      const value = formString(formData, name);
      if (value) focus.set(param, value);
    }
    const [page, token] = (session.url as string).split("#");
    return { url: `${page}${focus.size > 0 ? `?${focus}` : ""}#${token}` };
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
        { screen: configuredDeps().screenSetup, plans: configuredDeps().plans },
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
      updateEventType(env, id, changes, {
        screen: configuredDeps().screenSetup,
        plans: configuredDeps().plans,
      }),
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
          host_reassignment: formData.get("hostReassignment") === "on" ? "eligible" : "off",
          name_host_in_attendee_emails: formData.get("nameHostInAttendeeEmails") === "on",
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
