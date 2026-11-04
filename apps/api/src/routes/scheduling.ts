/**
 * Scheduling over the public API (`/v1/scheduling/*`): hosts, their schedules, event types, slots,
 * bookings, holds and series. Tenancy comes only from the API key.
 */

import { db } from "@coss/db";
import {
  approveBooking,
  type BookingActor,
  type CalendarDeps,
  cancelBooking,
  cancelReassignment,
  cancelSeries,
  confirmHold,
  connectCaldav,
  connectSimulated,
  createBookerSession,
  createBooking,
  createCalendarDelegation,
  createEventType,
  createHold,
  createHolidayCalendar,
  createHost,
  createHostSession,
  createManagerSession,
  createManageSession,
  createOutOfOffice,
  createReassignment,
  createSchedule,
  createSeries,
  declineBooking,
  deleteCalendarDelegation,
  deleteHold,
  deleteHolidayCalendar,
  deleteHost,
  deleteOutOfOffice,
  deleteSchedule,
  disconnectCalendar,
  eraseAttendee,
  eraseAttendeeByEmail,
  explainSlot,
  getBooking,
  getCalendarDelegation,
  getEventType,
  getHolidayCalendar,
  getHost,
  getOutOfOffice,
  getReassignment,
  getSchedule,
  getSettings,
  getSettingsRow,
  listBookingEvents,
  listBookings,
  listCalendarDelegations,
  listConnections,
  listEventTypeSlots,
  listEventTypes,
  listHolidayCalendars,
  listHolidays,
  listHosts,
  listOutOfOffice,
  listOutOfOfficeConflicts,
  listReassignCandidates,
  listReassignmentItems,
  listReassignments,
  listSchedules,
  markNoShow,
  previewReassignment,
  previewSeries,
  putOutOfOffice,
  reassignBooking,
  requireRouting,
  rescheduleBooking,
  resolveHost,
  type SchedulingDeps,
  SchedulingError,
  searchAvailability,
  setSimulatedBusy,
  startCalendarAuthorization,
  toConnectionObject,
  undoReassignment,
  updateBookingLocation,
  updateCalendar,
  updateCalendarDelegation,
  updateEventType,
  updateHolidayCalendar,
  updateHost,
  updateOutOfOffice,
  updateSchedule,
  updateSettings,
  verifyCalendarDelegation,
} from "@coss/scheduling";
import {
  AuthorizeCalendarRequest,
  AvailabilitySearchRequest,
  AvailabilitySearchResult,
  BookingEventList,
  BookingList,
  BookingObject,
  CalendarAuthorization,
  CalendarConnectionList,
  CalendarConnectionObject,
  CalendarDelegationList,
  CalendarDelegationObject,
  CancelBookingRequest,
  CancelledSeries,
  CancelSeriesRequest,
  ConfirmHoldRequest,
  ConflictsQuery,
  CreateBookingRequest,
  CreateCalendarConnectionRequest,
  CreateCalendarDelegationRequest,
  CreateEventTypeRequest,
  CreateHoldRequest,
  CreateHolidayCalendarRequest,
  CreateHostRequest,
  CreateOutOfOfficeRequest,
  CreateReassignmentRequest,
  CreateSeriesRequest,
  DeletedCalendarConnection,
  DeletedCalendarDelegation,
  DeletedHolidayCalendar,
  DeletedHost,
  DeletedOutOfOffice,
  DeletedSchedule,
  EraseAttendeeByEmailRequest,
  ErasedAttendee,
  ErasedAttendeeByEmail,
  EventTypeList,
  EventTypeObject,
  ExplainSlotQuery,
  HolidayCalendarList,
  HolidayCalendarObject,
  HolidayList,
  HostList,
  HostObject,
  ListBookingEventsQuery,
  ListBookingsQuery,
  ListOutOfOfficeQuery,
  OutOfOfficeConflictList,
  OutOfOfficeList,
  OutOfOfficeObject,
  PageQuery,
  PreviewReassignmentRequest,
  PutOutOfOfficeRequest,
  ReassignBookingRequest,
  ReassignCandidateList,
  ReassignCandidatesQuery,
  ReassignmentItemList,
  ReassignmentList,
  ReassignmentObject,
  ReassignmentPreview,
  RescheduleBookingRequest,
  ScheduleList,
  ScheduleObject,
  SeriesPreview,
  SeriesResult,
  SetSimulatedBusyRequest,
  SettingsObject,
  SlotExplanation,
  SlotList,
  SlotsQuery,
  UndoReassignmentRequest,
  UpdateBookingLocationRequest,
  UpdateCalendarDelegationRequest,
  UpdateCalendarRequest,
  UpdateEventTypeRequest,
  UpdateHolidayCalendarRequest,
  UpdateHostRequest,
  UpdateOutOfOfficeRequest,
  UpdateSettingsRequest,
  UpsertScheduleRequest,
  VerifyCalendarDelegationRequest,
} from "@coss/scheduling/schemas";
import { apiKeyHasPermissions } from "@coss/tenancy";
import { secretsKeyRing } from "@coss/webhooks";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { ApiError } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { limitSchedulingSlots, rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { billingErrorDoc, commonErrors, errorDoc, jsonDoc, requestIdHeader } from "./docs.ts";
import { idempotencyHeaders, idempotencyHook, idempotentReplayedHeader } from "./idempotency.ts";

const TAG_HOSTS = "Scheduling hosts";
const TAG_SCHEDULES = "Scheduling schedules";
const TAG_EVENT_TYPES = "Scheduling event types";
const TAG_AVAILABILITY = "Scheduling availability";
const TAG_BOOKINGS = "Scheduling bookings";
const TAG_SERIES = "Scheduling series";
const TAG_SETTINGS = "Scheduling settings";
const TAG_CALENDARS = "Scheduling calendars";
const TAG_OUT_OF_OFFICE = "Scheduling out of office";
const TAG_REASSIGNMENTS = "Scheduling reassignments";
const TAG_HOLIDAY_CALENDARS = "Scheduling holiday calendars";

/**
 * A key that can only create can't reassign, and something it creates that moves bookings is
 * reassigning them, later and from the worker, where nothing would ask.
 */
async function requireMovingBookings(c: Context<AppEnv>, existing: string | undefined) {
  if (existing !== "reassign") return;
  if (await apiKeyHasPermissions(c.var.auth.apiKeyId, { scheduling: ["update"] })) return;
  throw new ApiError(403, {
    type: "permission_error",
    code: "insufficient_permissions",
    message: "Moving existing bookings needs the scheduling:update permission.",
  });
}

const read = () => [requireApiKey({ scheduling: ["read"] }), rateLimit("api.read")];
const writing = (
  permission: "create" | "update" | "delete",
  operation: Parameters<typeof upgradeRequestBody>[0],
) => [
  requireApiKey({ scheduling: [permission] }),
  rateLimit("api.write"),
  upgradeRequestBody(operation),
];
const acting = (permission: "update" | "delete") => [
  requireApiKey({ scheduling: [permission] }),
  rateLimit("api.write"),
];

const param = (description: string, example: string) =>
  z.string().meta({ description, examples: [example] });
const HostParams = z.object({
  host: param("The host's id or uid.", "host_01kd2m9a0b1c2d3e4f5g6h7j8m"),
});
const ScheduleParams = HostParams.extend({
  schedule_id: param("The schedule's id.", "sched_01kd2m9a0b1c2d3e4f5g6h7j8m"),
});
const EventTypeParams = z.object({
  event_type: param("The event type's id or uid.", "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m"),
});
const BookingParams = z.object({
  id: param("The booking's id.", "book_01kd2m9a0b1c2d3e4f5g6h7j8m"),
});
const SeriesParams = z.object({
  id: param("The series' id.", "series_01kd2m9a0b1c2d3e4f5g6h7j8m"),
});
const ConnectionParams = HostParams.extend({
  id: param("The connection's id.", "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m"),
});
const CalendarParams = HostParams.extend({
  calendar_id: param("The calendar's id.", "cal_01kd2m9a0b1c2d3e4f5g6h7j8m"),
});
const DelegationParams = z.object({
  id: param("The delegation's id.", "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m"),
});
const AttendeeParams = z.object({ uid: param("Your id for the attendee.", "patient_77") });
const OutOfOfficeParams = z.object({
  id: param("The entry's id.", "ooo_01kd2m9a0b1c2d3e4f5g6h7j8m"),
});
const ExternalOutOfOfficeParams = z.object({
  external_id: param("Your own id for the entry.", "hr_leave_4471"),
});

const bodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};
const planRefused = errorDoc(
  "In live environments: the plan doesn't include this (`plan_feature_unavailable`), or it's past " +
    "the plan's limit (`plan_limit_reached`).",
);
const bookingRefused = errorDoc(
  "In live environments: an overdue invoice or spend limit (`billing_hold`), the project's budget " +
    "(`budget_exceeded`), the plan's allowance (`usage_limit_exceeded`) or what it includes " +
    "(`plan_feature_unavailable`).",
);
const notFound = errorDoc("Nothing with this id or uid exists in the environment (`not_found`).");
const invalid = errorDoc(
  "The request failed validation (`validation_error`, see `issues`), or can't be done: see `code`.",
);
const refusedBooking = errorDoc(
  "The time isn't available (`slot_unavailable`), `start`, `duration_minutes` or the occurrence " +
    "count is out of bounds (`invalid_time`), the attendee's time zone isn't an IANA name " +
    "(`invalid_time_zone`), the answers or attendee are invalid (`invalid_answers`, " +
    "`invalid_attendee`), or the `Idempotency-Key` was used with a different request " +
    "(`idempotency_key_reused`).",
);
const invalidHost = errorDoc(
  "The request failed validation (`validation_error`, see `issues`), `time_zone` isn't an IANA " +
    "name (`invalid_time_zone`), or another host has the `uid` (`uid_taken`).",
);
const invalidSchedule = errorDoc(
  "The request failed validation (`validation_error`, see `issues`), a range ends before it " +
    "starts or a date has two overrides (`invalid_schedule`), or `time_zone` isn't an IANA name " +
    "(`invalid_time_zone`).",
);
const invalidEventType = errorDoc(
  "The request failed validation (`validation_error`, see `issues`), the settings don't fit " +
    "together (`invalid_event_type`), `grid_time_zone` isn't an IANA name (`invalid_time_zone`), " +
    "another event type has the `uid` (`uid_taken`), or its text was refused (`content_refused`).",
);
const invalidWindow = errorDoc(
  "The request failed validation (`validation_error`, see `issues`), or `start`, `end` or " +
    "`duration_minutes` is invalid: `end` isn't after `start`, the window is longer than 62 days, " +
    "or the duration isn't one of the event type's (`invalid_time`).",
);
const invalidCalendar = errorDoc(
  "The request failed validation (`validation_error`, see `issues`), or the calendar can't be " +
    "connected: the provider isn't set up, the server's URL is refused, or a simulated calendar " +
    "was asked for outside a sandbox environment (`calendar_unavailable`).",
);
const refusedChange = errorDoc(
  "The booking can't change that way (`booking_not_changeable`), the new time isn't available " +
    "(`slot_unavailable`), or a hold expired (`hold_expired`).",
);

const BookingIdempotency = idempotencyHeaders(
  "Makes retries safe: a repeated request with the same key and body returns the original " +
    "booking instead of creating another, for 24 hours. A refused request keeps no key.",
);

const ReassignmentParams = z.object({
  id: z.string().meta({ description: "The reassignment's id." }),
});
const ReassignmentIdempotency = idempotencyHeaders(
  "Makes retries safe: a repeated request with the same key and body returns the original run " +
    "instead of starting another, for 24 hours.",
);

const createdBooking = (description: string, schema: z.ZodType = BookingObject) => ({
  description,
  headers: { "X-Request-Id": requestIdHeader, "Idempotent-Replayed": idempotentReplayedHeader },
  content: { "application/json": { schema } },
});

export const createHostRoute = createRoute({
  method: "post",
  path: "/scheduling/hosts",
  operationId: "createSchedulingHost",
  tags: [TAG_HOSTS],
  summary: "Create a host",
  description: "A person who can be booked: one of your users, such as a doctor or a tutor.",
  security: [{ bearerAuth: [] }],
  middleware: writing("create", "POST /v1/scheduling/hosts"),
  request: {
    body: { required: true, content: { "application/json": { schema: CreateHostRequest } } },
  },
  responses: {
    402: planRefused,
    201: jsonDoc("The host.", HostObject),
    ...commonErrors,
    ...bodyErrors,
    422: invalidHost,
  },
});

export const listHostsRoute = createRoute({
  method: "get",
  path: "/scheduling/hosts",
  operationId: "listSchedulingHosts",
  tags: [TAG_HOSTS],
  summary: "List hosts",
  description: "The environment's hosts, newest first.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { query: PageQuery },
  responses: { 200: jsonDoc("A page of hosts.", HostList), ...commonErrors, 422: invalid },
});

export const getHostRoute = createRoute({
  method: "get",
  path: "/scheduling/hosts/{host}",
  operationId: "getSchedulingHost",
  tags: [TAG_HOSTS],
  summary: "Retrieve a host",
  description: "A host by its id or your uid.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: HostParams },
  responses: { 200: jsonDoc("The host.", HostObject), ...commonErrors, 404: notFound },
});

export const updateHostRoute = createRoute({
  method: "patch",
  path: "/scheduling/hosts/{host}",
  operationId: "updateSchedulingHost",
  tags: [TAG_HOSTS],
  summary: "Update a host",
  description: "Changes what's given. A `disabled` host keeps its bookings but gets no new ones.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PATCH /v1/scheduling/hosts/{host}"),
  request: {
    params: HostParams,
    body: { required: true, content: { "application/json": { schema: UpdateHostRequest } } },
  },
  responses: {
    200: jsonDoc("The host.", HostObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalidHost,
  },
});

export const deleteHostRoute = createRoute({
  method: "delete",
  path: "/scheduling/hosts/{host}",
  operationId: "deleteSchedulingHost",
  tags: [TAG_HOSTS],
  summary: "Delete a host",
  description:
    "Removes the host and its schedules and calendars. Refused while bookings are still to come " +
    "(`host_has_live_bookings`): cancel them, or set the host's status to `disabled`.",
  security: [{ bearerAuth: [] }],
  middleware: acting("delete"),
  request: { params: HostParams },
  responses: {
    200: jsonDoc("Deleted.", DeletedHost),
    ...commonErrors,
    404: notFound,
    422: invalid,
  },
});

export const createScheduleRoute = createRoute({
  method: "post",
  path: "/scheduling/hosts/{host}/schedules",
  operationId: "createSchedulingSchedule",
  tags: [TAG_SCHEDULES],
  summary: "Create a schedule",
  description:
    "A host's weekly hours and date overrides, in local time. The first one is the host's default.",
  security: [{ bearerAuth: [] }],
  middleware: writing("create", "POST /v1/scheduling/hosts/{host}/schedules"),
  request: {
    params: HostParams,
    body: { required: true, content: { "application/json": { schema: UpsertScheduleRequest } } },
  },
  responses: {
    201: jsonDoc("The schedule.", ScheduleObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalidSchedule,
  },
});

export const listSchedulesRoute = createRoute({
  method: "get",
  path: "/scheduling/hosts/{host}/schedules",
  operationId: "listSchedulingSchedules",
  tags: [TAG_SCHEDULES],
  summary: "List a host's schedules",
  description: "All of the host's schedules, oldest first.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: HostParams },
  responses: { 200: jsonDoc("The schedules.", ScheduleList), ...commonErrors, 404: notFound },
});

export const getScheduleRoute = createRoute({
  method: "get",
  path: "/scheduling/hosts/{host}/schedules/{schedule_id}",
  operationId: "getSchedulingSchedule",
  tags: [TAG_SCHEDULES],
  summary: "Retrieve a schedule",
  description: "One of the host's schedules.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: ScheduleParams },
  responses: { 200: jsonDoc("The schedule.", ScheduleObject), ...commonErrors, 404: notFound },
});

export const updateScheduleRoute = createRoute({
  method: "put",
  path: "/scheduling/hosts/{host}/schedules/{schedule_id}",
  operationId: "updateSchedulingSchedule",
  tags: [TAG_SCHEDULES],
  summary: "Replace a schedule",
  description:
    "Replaces its weekly rules, and its overrides when given. Existing bookings stay: a schedule " +
    "only decides what's offered next.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PUT /v1/scheduling/hosts/{host}/schedules/{schedule_id}"),
  request: {
    params: ScheduleParams,
    body: { required: true, content: { "application/json": { schema: UpsertScheduleRequest } } },
  },
  responses: {
    200: jsonDoc("The schedule.", ScheduleObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalidSchedule,
  },
});

export const deleteScheduleRoute = createRoute({
  method: "delete",
  path: "/scheduling/hosts/{host}/schedules/{schedule_id}",
  operationId: "deleteSchedulingSchedule",
  tags: [TAG_SCHEDULES],
  summary: "Delete a schedule",
  description: "Refused for the host's default schedule.",
  security: [{ bearerAuth: [] }],
  middleware: acting("delete"),
  request: { params: ScheduleParams },
  responses: {
    200: jsonDoc("Deleted.", DeletedSchedule),
    ...commonErrors,
    404: notFound,
    422: errorDoc(
      "This is the host's default schedule (`invalid_schedule`): make another one the default first.",
    ),
  },
});

export const createEventTypeRoute = createRoute({
  method: "post",
  path: "/scheduling/event_types",
  operationId: "createSchedulingEventType",
  tags: [TAG_EVENT_TYPES],
  summary: "Create an event type",
  description:
    "What can be booked: `one_on_one` with one host, `pool` for any free host, `collective` when " +
    "every required host must be free, or `group` for a session with seats.",
  security: [{ bearerAuth: [] }],
  middleware: writing("create", "POST /v1/scheduling/event_types"),
  request: {
    body: { required: true, content: { "application/json": { schema: CreateEventTypeRequest } } },
  },
  responses: {
    402: planRefused,
    201: jsonDoc("The event type.", EventTypeObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalidEventType,
  },
});

export const listEventTypesRoute = createRoute({
  method: "get",
  path: "/scheduling/event_types",
  operationId: "listSchedulingEventTypes",
  tags: [TAG_EVENT_TYPES],
  summary: "List event types",
  description: "The environment's event types, newest first.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { query: PageQuery },
  responses: {
    200: jsonDoc("A page of event types.", EventTypeList),
    ...commonErrors,
    422: invalid,
  },
});

export const getEventTypeRoute = createRoute({
  method: "get",
  path: "/scheduling/event_types/{event_type}",
  operationId: "getSchedulingEventType",
  tags: [TAG_EVENT_TYPES],
  summary: "Retrieve an event type",
  description: "An event type by its id or your uid.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: EventTypeParams },
  responses: { 200: jsonDoc("The event type.", EventTypeObject), ...commonErrors, 404: notFound },
});

export const updateEventTypeRoute = createRoute({
  method: "patch",
  path: "/scheduling/event_types/{event_type}",
  operationId: "updateSchedulingEventType",
  tags: [TAG_EVENT_TYPES],
  summary: "Update an event type",
  description:
    "Changes what's given. Existing bookings keep what they were booked with. Set `status` to " +
    "`archived` to stop new bookings.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PATCH /v1/scheduling/event_types/{event_type}"),
  request: {
    params: EventTypeParams,
    body: { required: true, content: { "application/json": { schema: UpdateEventTypeRequest } } },
  },
  responses: {
    402: planRefused,
    200: jsonDoc("The event type.", EventTypeObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalidEventType,
  },
});

export const listSlotsRoute = createRoute({
  method: "get",
  path: "/scheduling/event_types/{event_type}/slots",
  operationId: "listSchedulingSlots",
  tags: [TAG_AVAILABILITY],
  summary: "List available slots",
  description:
    "Starts an attendee can book between `start` and `end` (at most 62 days), as UTC instants to " +
    "show in their own time zone. A host whose calendar can't be read isn't offered.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: EventTypeParams, query: SlotsQuery },
  responses: {
    402: planRefused,
    200: jsonDoc("The slots.", SlotList),
    ...commonErrors,
    404: notFound,
    422: invalidWindow,
  },
});

export const explainSlotRoute = createRoute({
  method: "get",
  path: "/scheduling/event_types/{event_type}/slots/explain",
  operationId: "explainSchedulingSlot",
  tags: [TAG_AVAILABILITY],
  summary: "Explain a slot",
  description:
    "Why one start can or can't be booked right now, host by host, decided the same way a booking is. " +
    "For support and debugging: it says when a host is busy, so don't show it to attendees.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: EventTypeParams, query: ExplainSlotQuery },
  responses: {
    402: planRefused,
    200: jsonDoc("Whether it can be booked, and why.", SlotExplanation),
    ...commonErrors,
    404: notFound,
    422: invalidWindow,
  },
});

export const searchAvailabilityRoute = createRoute({
  method: "post",
  path: "/scheduling/availability/search",
  operationId: "searchSchedulingAvailability",
  tags: [TAG_AVAILABILITY],
  summary: "Search availability across hosts",
  description:
    "For \"who's free\" pages: each matching host's soonest slots, soonest first, across up to 500 hosts.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ scheduling: ["read"] }),
    rateLimit("api.read"),
    upgradeRequestBody("POST /v1/scheduling/availability/search"),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: AvailabilitySearchRequest } },
    },
  },
  responses: {
    402: planRefused,
    200: jsonDoc("Hosts with slots.", AvailabilitySearchResult),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalidWindow,
  },
});

export const createBookingRoute = createRoute({
  method: "post",
  path: "/scheduling/bookings",
  operationId: "createSchedulingBooking",
  tags: [TAG_BOOKINGS],
  summary: "Create a booking",
  description:
    "Books a slot, or joins a group session. Without a `host`, a pool chooses fairly among those " +
    "free. An event type that requires approval answers with a `pending_approval` booking.",
  security: [{ bearerAuth: [] }],
  middleware: writing("create", "POST /v1/scheduling/bookings"),
  request: {
    headers: BookingIdempotency,
    body: { required: true, content: { "application/json": { schema: CreateBookingRequest } } },
  },
  responses: {
    402: bookingRefused,
    201: createdBooking("The booking."),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    409: errorDoc("A request with this key is still running (`idempotency_in_progress`)."),
    422: refusedBooking,
  },
});

export const listBookingsRoute = createRoute({
  method: "get",
  path: "/scheduling/bookings",
  operationId: "listSchedulingBookings",
  tags: [TAG_BOOKINGS],
  summary: "List bookings",
  description: "The environment's bookings, newest first. Answers aren't included.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { query: ListBookingsQuery },
  responses: { 200: jsonDoc("A page of bookings.", BookingList), ...commonErrors, 422: invalid },
});

export const getBookingRoute = createRoute({
  method: "get",
  path: "/scheduling/bookings/{id}",
  operationId: "getSchedulingBooking",
  tags: [TAG_BOOKINGS],
  summary: "Retrieve a booking",
  description: "A booking with its attendees and their answers.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: BookingParams },
  responses: { 200: jsonDoc("The booking.", BookingObject), ...commonErrors, 404: notFound },
});

export const rescheduleBookingRoute = createRoute({
  method: "post",
  path: "/scheduling/bookings/{id}/reschedule",
  operationId: "rescheduleSchedulingBooking",
  tags: [TAG_BOOKINGS],
  summary: "Reschedule a booking",
  description:
    "Moves it to a new time, keeping its id. The old time stays booked if the new one isn't free.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/bookings/{id}/reschedule"),
  request: {
    params: BookingParams,
    body: { required: true, content: { "application/json": { schema: RescheduleBookingRequest } } },
  },
  responses: {
    200: jsonDoc("The booking.", BookingObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: refusedChange,
  },
});

/**
 * This route's body came later, and callers that send a JSON content type with no body have always
 * been fine. Hono parses by the header, even with `required: false`, so an empty body is `{}` here.
 */
const emptyBodyIsAllowed = createMiddleware(async (c, next) => {
  if (c.req.header("Content-Type")?.includes("json") && !(await c.req.text()).trim()) {
    const { url, method, headers } = c.req.raw;
    c.req.raw = new Request(url, { method, headers, body: "{}" });
    c.req.bodyCache = {};
  }
  await next();
});

export const cancelBookingRoute = createRoute({
  method: "post",
  path: "/scheduling/bookings/{id}/cancel",
  operationId: "cancelSchedulingBooking",
  tags: [TAG_BOOKINGS],
  summary: "Cancel a booking",
  description: "Frees the time and removes the calendar event. A cancelled booking stays charged.",
  security: [{ bearerAuth: [] }],
  middleware: [...acting("update"), emptyBodyIsAllowed],
  request: {
    params: BookingParams,
    body: {
      content: { "application/json": { schema: CancelBookingRequest } },
      required: false,
    },
  },
  responses: {
    200: jsonDoc("The booking.", BookingObject),
    ...commonErrors,
    404: notFound,
    422: refusedChange,
  },
});

export const listBookingEventsRoute = createRoute({
  method: "get",
  path: "/scheduling/bookings/{id}/events",
  operationId: "listSchedulingBookingEvents",
  tags: [TAG_BOOKINGS],
  summary: "List a booking's history",
  description:
    "What's happened to a booking, oldest first, and who did it. There's no personal data in here.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: BookingParams, query: ListBookingEventsQuery },
  responses: {
    200: jsonDoc("The events.", BookingEventList),
    ...commonErrors,
    404: notFound,
  },
});

export const approveBookingRoute = createRoute({
  method: "post",
  path: "/scheduling/bookings/{id}/approve",
  operationId: "approveSchedulingBooking",
  tags: [TAG_BOOKINGS],
  summary: "Approve a booking",
  description: "Confirms a `pending_approval` booking.",
  security: [{ bearerAuth: [] }],
  middleware: acting("update"),
  request: { params: BookingParams },
  responses: {
    200: jsonDoc("The booking.", BookingObject),
    ...commonErrors,
    404: notFound,
    422: refusedChange,
  },
});

export const declineBookingRoute = createRoute({
  method: "post",
  path: "/scheduling/bookings/{id}/decline",
  operationId: "declineSchedulingBooking",
  tags: [TAG_BOOKINGS],
  summary: "Decline a booking",
  description: "Refuses a `pending_approval` booking and frees the time.",
  security: [{ bearerAuth: [] }],
  middleware: acting("update"),
  request: { params: BookingParams },
  responses: {
    200: jsonDoc("The booking.", BookingObject),
    ...commonErrors,
    404: notFound,
    422: refusedChange,
  },
});

export const noShowBookingRoute = createRoute({
  method: "post",
  path: "/scheduling/bookings/{id}/no_show",
  operationId: "markSchedulingBookingNoShow",
  tags: [TAG_BOOKINGS],
  summary: "Mark a no-show",
  description: "Records that the attendee didn't come, once the booking has started.",
  security: [{ bearerAuth: [] }],
  middleware: acting("update"),
  request: { params: BookingParams },
  responses: {
    200: jsonDoc("The booking.", BookingObject),
    ...commonErrors,
    404: notFound,
    422: refusedChange,
  },
});

export const updateBookingLocationRoute = createRoute({
  method: "patch",
  path: "/scheduling/bookings/{id}/location",
  operationId: "updateSchedulingBookingLocation",
  tags: [TAG_BOOKINGS],
  summary: "Set a booking's location",
  description:
    "Where it happens, such as the meeting link you made after the `scheduling.booking.confirmed` webhook.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PATCH /v1/scheduling/bookings/{id}/location"),
  request: {
    params: BookingParams,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateBookingLocationRequest } },
    },
  },
  responses: {
    200: jsonDoc("The booking.", BookingObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: refusedChange,
  },
});

export const createHoldRoute = createRoute({
  method: "post",
  path: "/scheduling/holds",
  operationId: "createSchedulingHold",
  tags: [TAG_BOOKINGS],
  summary: "Hold a slot",
  description:
    "Keeps a slot for a while (the event type's `hold_ttl_seconds`) so you can take payment, then " +
    "confirm it. Answers with a `held` booking, which isn't charged and sends nothing.",
  security: [{ bearerAuth: [] }],
  middleware: writing("create", "POST /v1/scheduling/holds"),
  request: {
    headers: BookingIdempotency,
    body: { required: true, content: { "application/json": { schema: CreateHoldRequest } } },
  },
  responses: {
    402: bookingRefused,
    201: createdBooking("The held booking."),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    409: errorDoc("A request with this key is still running (`idempotency_in_progress`)."),
    422: refusedBooking,
  },
});

export const confirmHoldRoute = createRoute({
  method: "post",
  path: "/scheduling/holds/{id}/confirm",
  operationId: "confirmSchedulingHold",
  tags: [TAG_BOOKINGS],
  summary: "Confirm a hold",
  description:
    "Turns a hold into a booking. Always succeeds before the hold expires. Repeating it is safe.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/holds/{id}/confirm"),
  request: {
    params: BookingParams,
    body: { required: true, content: { "application/json": { schema: ConfirmHoldRequest } } },
  },
  responses: {
    200: jsonDoc("The booking.", BookingObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: refusedChange,
  },
});

export const releaseHoldRoute = createRoute({
  method: "delete",
  path: "/scheduling/holds/{id}",
  operationId: "releaseSchedulingHold",
  tags: [TAG_BOOKINGS],
  summary: "Release a hold",
  description: "Gives the slot back early.",
  security: [{ bearerAuth: [] }],
  middleware: acting("update"),
  request: { params: BookingParams },
  responses: {
    200: jsonDoc("The cancelled booking.", BookingObject),
    ...commonErrors,
    404: notFound,
    422: refusedChange,
  },
});

export const createSeriesRoute = createRoute({
  method: "post",
  path: "/scheduling/series",
  operationId: "createSchedulingSeries",
  tags: [TAG_SERIES],
  summary: "Create a recurring series",
  description:
    "Books up to 52 occurrences, keeping the attendee's local time across DST changes. Each one " +
    "is an ordinary booking that can move on its own, and a pool keeps one host throughout.",
  security: [{ bearerAuth: [] }],
  middleware: writing("create", "POST /v1/scheduling/series"),
  request: {
    headers: BookingIdempotency,
    body: { required: true, content: { "application/json": { schema: CreateSeriesRequest } } },
  },
  responses: {
    402: bookingRefused,
    201: createdBooking("The series and its bookings.", SeriesResult),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    409: errorDoc("A request with this key is still running (`idempotency_in_progress`)."),
    422: refusedBooking,
  },
});

export const previewSeriesRoute = createRoute({
  method: "post",
  path: "/scheduling/series/preview",
  operationId: "previewSchedulingSeries",
  tags: [TAG_SERIES],
  summary: "Preview a recurring series",
  description: "Which occurrences would be free, without booking anything.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ scheduling: ["read"] }),
    rateLimit("api.read"),
    upgradeRequestBody("POST /v1/scheduling/series/preview"),
  ] as const,
  request: {
    body: { required: true, content: { "application/json": { schema: CreateSeriesRequest } } },
  },
  responses: {
    402: planRefused,
    200: jsonDoc("Each occurrence.", SeriesPreview),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalidWindow,
  },
});

export const cancelSeriesRoute = createRoute({
  method: "post",
  path: "/scheduling/series/{id}/cancel",
  operationId: "cancelSchedulingSeries",
  tags: [TAG_SERIES],
  summary: "Cancel a recurring series",
  description: "Cancels the occurrences from `from_index` on, or all of them.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/series/{id}/cancel"),
  request: {
    params: SeriesParams,
    body: { required: true, content: { "application/json": { schema: CancelSeriesRequest } } },
  },
  responses: {
    200: jsonDoc("The cancelled bookings.", CancelledSeries),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
  },
});

export const eraseAttendeeRoute = createRoute({
  method: "delete",
  path: "/scheduling/attendees/{uid}",
  operationId: "eraseSchedulingAttendee",
  tags: [TAG_BOOKINGS],
  summary: "Erase an attendee",
  description:
    "Removes this person's details and answers from every booking now, and ends any booker session fixed to them. The bookings themselves stay.",
  security: [{ bearerAuth: [] }],
  middleware: acting("delete"),
  request: { params: AttendeeParams },
  responses: { 200: jsonDoc("How many were erased.", ErasedAttendee), ...commonErrors },
});

export const eraseAttendeeByEmailRoute = createRoute({
  method: "post",
  path: "/scheduling/attendees/erase",
  operationId: "eraseSchedulingAttendeeByEmail",
  tags: [TAG_BOOKINGS],
  summary: "Erase an attendee or guest by email",
  description:
    "Removes this address's details and answers from every booking now, for someone you have no `uid` for, such as a guest. The bookings themselves stay.",
  security: [{ bearerAuth: [] }],
  middleware: writing("delete", "POST /v1/scheduling/attendees/erase"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: EraseAttendeeByEmailRequest } },
    },
  },
  responses: {
    200: jsonDoc("How many were erased.", ErasedAttendeeByEmail),
    ...commonErrors,
    ...bodyErrors,
  },
});

export const authorizeCalendarRoute = createRoute({
  method: "post",
  path: "/scheduling/hosts/{host}/calendar_connections/authorize",
  operationId: "authorizeSchedulingCalendar",
  tags: [TAG_CALENDARS],
  summary: "Start connecting a calendar",
  description:
    "A URL for the host to give consent at Google or Microsoft. Open it in a new window: providers " +
    "refuse to be framed. Coss.com reads only busy times, and writes events with a neutral title unless the event type's `host_calendar_details` is `full`.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/hosts/{host}/calendar_connections/authorize"),
  request: {
    params: HostParams,
    body: {
      required: true,
      content: { "application/json": { schema: AuthorizeCalendarRequest } },
    },
  },
  responses: {
    200: jsonDoc("Where to send the host.", CalendarAuthorization),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalidCalendar,
  },
});

export const createCalendarConnectionRoute = createRoute({
  method: "post",
  path: "/scheduling/hosts/{host}/calendar_connections",
  operationId: "createSchedulingCalendarConnection",
  tags: [TAG_CALENDARS],
  summary: "Connect a calendar with a password",
  description:
    "CalDAV (Apple and others) with an app password, or, in sandbox environments, a `simulated` " +
    "calendar whose busy times you set yourself. Google and Microsoft use `authorize`.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/hosts/{host}/calendar_connections"),
  request: {
    params: HostParams,
    body: {
      required: true,
      content: { "application/json": { schema: CreateCalendarConnectionRequest } },
    },
  },
  responses: {
    201: jsonDoc("The connection.", CalendarConnectionObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalidCalendar,
  },
});

export const listCalendarConnectionsRoute = createRoute({
  method: "get",
  path: "/scheduling/hosts/{host}/calendar_connections",
  operationId: "listSchedulingCalendarConnections",
  tags: [TAG_CALENDARS],
  summary: "List a host's calendar connections",
  description: "With each connection's calendars and which of them count.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: HostParams },
  responses: {
    200: jsonDoc("The connections.", CalendarConnectionList),
    ...commonErrors,
    404: notFound,
  },
});

export const deleteCalendarConnectionRoute = createRoute({
  method: "delete",
  path: "/scheduling/hosts/{host}/calendar_connections/{id}",
  operationId: "deleteSchedulingCalendarConnection",
  tags: [TAG_CALENDARS],
  summary: "Disconnect a calendar",
  description:
    "Revokes coss.com's access and deletes every busy time read through it. One a calendar " +
    "delegation manages is refused (`calendar_managed`).",
  security: [{ bearerAuth: [] }],
  middleware: acting("update"),
  request: { params: ConnectionParams },
  responses: {
    200: jsonDoc("Disconnected.", DeletedCalendarConnection),
    ...commonErrors,
    404: notFound,
    422: invalid,
  },
});

export const updateCalendarRoute = createRoute({
  method: "patch",
  path: "/scheduling/hosts/{host}/calendars/{calendar_id}",
  operationId: "updateSchedulingCalendar",
  tags: [TAG_CALENDARS],
  summary: "Choose how a calendar counts",
  description: "Whether its busy times block slots, and whether bookings are written to it.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PATCH /v1/scheduling/hosts/{host}/calendars/{calendar_id}"),
  request: {
    params: CalendarParams,
    body: { required: true, content: { "application/json": { schema: UpdateCalendarRequest } } },
  },
  responses: {
    200: jsonDoc("The host's connections.", CalendarConnectionList),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
  },
});

const refusedDelegation = errorDoc(
  "The credentials or mailbox aren't valid (`invalid_calendar_delegation`), or the provider refused " +
    "them (`calendar_delegation_refused`, and `message` says what to fix).",
);

export const createCalendarDelegationRoute = createRoute({
  method: "post",
  path: "/scheduling/calendar_delegations",
  operationId: "createSchedulingCalendarDelegation",
  tags: [TAG_CALENDARS],
  summary: "Add a calendar delegation",
  description:
    "An admin authorizes once, and every host on the domain gets their calendar with no consent " +
    "screen. It stays `pending`: authorize what it returns, then verify it. Credentials are never returned.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/calendar_delegations"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateCalendarDelegationRequest } },
    },
  },
  responses: {
    201: jsonDoc("The delegation.", CalendarDelegationObject),
    ...commonErrors,
    ...bodyErrors,
    402: billingErrorDoc(
      "The organization's plan doesn't include calendar delegations (`plan_feature_unavailable`)",
    ),
    422: refusedDelegation,
  },
});

export const listCalendarDelegationsRoute = createRoute({
  method: "get",
  path: "/scheduling/calendar_delegations",
  operationId: "listSchedulingCalendarDelegations",
  tags: [TAG_CALENDARS],
  summary: "List calendar delegations",
  description: "With how many hosts each has connected.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  responses: {
    200: jsonDoc("The delegations.", CalendarDelegationList),
    ...commonErrors,
  },
});

export const getCalendarDelegationRoute = createRoute({
  method: "get",
  path: "/scheduling/calendar_delegations/{id}",
  operationId: "getSchedulingCalendarDelegation",
  tags: [TAG_CALENDARS],
  summary: "Get a calendar delegation",
  description: "Its status, what to authorize, and how many hosts it has connected.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: DelegationParams },
  responses: {
    200: jsonDoc("The delegation.", CalendarDelegationObject),
    ...commonErrors,
    404: notFound,
  },
});

export const updateCalendarDelegationRoute = createRoute({
  method: "patch",
  path: "/scheduling/calendar_delegations/{id}",
  operationId: "updateSchedulingCalendarDelegation",
  tags: [TAG_CALENDARS],
  summary: "Update a calendar delegation",
  description:
    "New credentials are tried on the verified mailbox before they replace the old ones, and end an " +
    "outage if they work.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PATCH /v1/scheduling/calendar_delegations/{id}"),
  request: {
    params: DelegationParams,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateCalendarDelegationRequest } },
    },
  },
  responses: {
    200: jsonDoc("The delegation.", CalendarDelegationObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    402: billingErrorDoc(
      "The organization's plan doesn't include calendar delegations (`plan_feature_unavailable`)",
    ),
    422: refusedDelegation,
  },
});

export const verifyCalendarDelegationRoute = createRoute({
  method: "post",
  path: "/scheduling/calendar_delegations/{id}/verify",
  operationId: "verifySchedulingCalendarDelegation",
  tags: [TAG_CALENDARS],
  summary: "Verify a calendar delegation",
  description:
    "Tries one real mailbox. Passing makes it `active`, and its hosts start connecting. Google can " +
    "take up to 24 hours to apply a new authorization, so a refusal may just need time.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/calendar_delegations/{id}/verify"),
  request: {
    params: DelegationParams,
    body: {
      required: true,
      content: { "application/json": { schema: VerifyCalendarDelegationRequest } },
    },
  },
  responses: {
    200: jsonDoc("The delegation.", CalendarDelegationObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    402: billingErrorDoc(
      "The organization's plan doesn't include calendar delegations (`plan_feature_unavailable`)",
    ),
    422: refusedDelegation,
  },
});

export const deleteCalendarDelegationRoute = createRoute({
  method: "delete",
  path: "/scheduling/calendar_delegations/{id}",
  operationId: "deleteSchedulingCalendarDelegation",
  tags: [TAG_CALENDARS],
  summary: "Delete a calendar delegation",
  description:
    "Its hosts lose these calendars within minutes. They stay bookable with no conflict check, and " +
    "events already written stay on their calendars, out of reach of later moves or cancellations.",
  security: [{ bearerAuth: [] }],
  middleware: acting("update"),
  request: { params: DelegationParams },
  responses: {
    200: jsonDoc("Being removed.", DeletedCalendarDelegation),
    ...commonErrors,
    404: notFound,
  },
});

export const setSimulatedBusyRoute = createRoute({
  method: "put",
  path: "/scheduling/hosts/{host}/simulated_busy",
  operationId: "setSchedulingSimulatedBusy",
  tags: [TAG_CALENDARS],
  summary: "Set a simulated calendar's busy times",
  description: "Sandbox environments only: test how bookings react to a busy calendar.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PUT /v1/scheduling/hosts/{host}/simulated_busy"),
  request: {
    params: HostParams,
    body: { required: true, content: { "application/json": { schema: SetSimulatedBusyRequest } } },
  },
  responses: {
    204: { description: "Set.", headers: { "X-Request-Id": requestIdHeader } },
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), or this isn't a sandbox " +
        "environment: simulated calendars only exist there (`calendar_unavailable`).",
    ),
  },
});

const SessionExpiry = z.number().int().min(60).max(86_400).optional().meta({
  description: "Seconds until it stops working. At most a day.",
});

const CreatedSessionBody = z
  .object({
    object: z.literal("scheduling.session"),
    id: z.string(),
    token: z.string().meta({
      description: "Shown only now. A bearer token for the client API.",
    }),
    url: z.string().nullable().meta({
      description: "coss.com's hosted page, with the token in its fragment.",
    }),
    expires_at: z.string(),
  })
  .meta({
    id: "SchedulingSession",
    examples: [
      {
        object: "scheduling.session",
        id: "schs_01kd2m9a0b1c2d3e4f5g6h7j8m",
        token: "cossch_abc123",
        url: "https://example.test/h/schs_01kd2m9a0b1c2d3e4f5g6h7j8m#cossch_abc123",
        expires_at: "2027-01-01T11:00:00.000Z",
      },
    ],
  });

const CreateHostSessionRequest = z
  .strictObject({
    expires_in: SessionExpiry,
    read_only: z
      .boolean()
      .optional()
      .meta({ description: "The host can look but not change anything." }),
  })
  .meta({ id: "CreateSchedulingHostSessionRequest", examples: [{ expires_in: 3600 }] });

const CreateManagerSessionRequest = z
  .strictObject({
    hosts: z.array(z.string()).min(1).max(1000).optional().meta({
      description: "The hosts this page can reach, by id or uid.",
    }),
    host_filter: z
      .record(z.string(), z.union([z.string(), z.array(z.string())]))
      .optional()
      .meta({ description: "Everyone matching these attributes, asked again on every request." }),
    expires_in: SessionExpiry,
    read_only: z.boolean().optional(),
  })
  .meta({
    id: "CreateSchedulingManagerSessionRequest",
    examples: [{ host_filter: { team: "cardiology" }, expires_in: 3600 }],
  });

const CreateBookerSessionRequest = z
  .strictObject({
    event_type: z.string().meta({ description: "The event type's id or uid." }),
    host: z.string().optional().meta({ description: "Only this host (id or uid)." }),
    attributes: CreateBookingRequest.shape.attributes.meta({
      description:
        "Only offer times, and book, among pool hosts matching all of these. The browser can't see or change them.",
    }),
    attendee: CreateBookingRequest.shape.attendee.optional().meta({
      description: "Who's booking, if you already know: the browser then can't change it.",
    }),
    expires_in: SessionExpiry,
  })
  .meta({
    id: "CreateSchedulingBookerSessionRequest",
    examples: [
      {
        event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        attendee: { uid: "patient_77", name: "Sam Lee", time_zone: "UTC" },
      },
    ],
  });

export const createHostSessionRoute = createRoute({
  method: "post",
  path: "/scheduling/hosts/{host}/sessions",
  operationId: "createSchedulingHostSession",
  tags: [TAG_HOSTS],
  summary: "Create a host session",
  description:
    "Lets one host manage their own hours, calendars and locations, on coss.com's hosted page or your own UI. " +
    "Send the `url` to their browser, or embed it with `coss/scheduling`.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/hosts/{host}/sessions"),
  request: {
    params: HostParams,
    body: { required: true, content: { "application/json": { schema: CreateHostSessionRequest } } },
  },
  responses: {
    402: planRefused,
    201: jsonDoc("The session.", CreatedSessionBody),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalid,
  },
});

export const createManagerSessionRoute = createRoute({
  method: "post",
  path: "/scheduling/manager_sessions",
  operationId: "createSchedulingManagerSession",
  tags: [TAG_HOSTS],
  summary: "Create a manager session",
  description:
    "Lets a team lead manage cover for the hosts you name, or those matching an attribute filter whenever it's asked: time off, bookings that need someone else, and moving them. It never sees attendees' details. Send the `url` to their browser, or embed it with `coss/scheduling`.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/manager_sessions"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateManagerSessionRequest } },
    },
  },
  responses: {
    201: jsonDoc("The session.", CreatedSessionBody),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalid,
  },
});

export const createBookerSessionRoute = createRoute({
  method: "post",
  path: "/scheduling/booker_sessions",
  operationId: "createSchedulingBookerSession",
  tags: [TAG_BOOKINGS],
  summary: "Create a booker session",
  description:
    "Lets a browser book one event type, on coss.com's hosted page or your own UI, without your API key.",
  security: [{ bearerAuth: [] }],
  middleware: writing("create", "POST /v1/scheduling/booker_sessions"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateBookerSessionRequest } },
    },
  },
  responses: {
    402: planRefused,
    201: jsonDoc("The session.", CreatedSessionBody),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalid,
  },
});

export const createManageSessionRoute = createRoute({
  method: "post",
  path: "/scheduling/bookings/{id}/manage_sessions",
  operationId: "createSchedulingManageSession",
  tags: [TAG_BOOKINGS],
  summary: "Create a manage session",
  description:
    "Lets an attendee reschedule or cancel this one booking, within the event type's cutoffs. Stops " +
    "working when the booking's cancelled, or a day after it ends.",
  security: [{ bearerAuth: [] }],
  middleware: acting("update"),
  request: { params: BookingParams },
  responses: {
    201: jsonDoc("The session.", CreatedSessionBody),
    ...commonErrors,
    404: notFound,
  },
});

export const reassignBookingRoute = createRoute({
  method: "post",
  path: "/scheduling/bookings/{id}/reassign",
  operationId: "reassignSchedulingBooking",
  tags: [TAG_BOOKINGS],
  summary: "Reassign a booking",
  description:
    "Gives a booking to another host, keeping its id and time. Works for every kind: a group session moves as a whole, from any of its seats, and one that's already started changes for the record, with nobody told. Whoever leaves and joins is told, and the attendee unless you say not to.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/bookings/{id}/reassign"),
  request: {
    params: BookingParams,
    body: { required: true, content: { "application/json": { schema: ReassignBookingRequest } } },
  },
  responses: {
    200: jsonDoc("The booking.", BookingObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: errorDoc(
      "The request doesn't make sense (`invalid_reassignment`), that host can't take it " +
        "(`reassign_target_unavailable`), nobody can (`no_reassign_candidate`), or the booking can't change (`booking_not_changeable`, `hold_expired`).",
    ),
  },
});

export const listReassignCandidatesRoute = createRoute({
  method: "get",
  path: "/scheduling/bookings/{id}/reassign_candidates",
  operationId: "listSchedulingReassignCandidates",
  tags: [TAG_BOOKINGS],
  summary: "List who a booking could go to",
  description:
    "The environment's other active hosts: members of the event type first, in the order a pool would pick them, each saying whether they're free and why not. Things can change before you ask: reassigning decides again.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: BookingParams, query: ReassignCandidatesQuery },
  responses: {
    200: jsonDoc("The candidates.", ReassignCandidateList),
    ...commonErrors,
    404: notFound,
    422: invalid,
  },
});

export const previewReassignmentRoute = createRoute({
  method: "post",
  path: "/scheduling/reassignments/preview",
  operationId: "previewSchedulingReassignment",
  tags: [TAG_REASSIGNMENTS],
  summary: "Preview a bulk reassignment",
  description:
    "Who each booking would go to, and why not when nobody can take it, without moving anything. It works down them in order, so two can't both be promised the same free hour. Change any of it and start the run with `assignments`. Covers the first 500. Things can change before you start it: the run decides again.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PreviewReassignmentRequest } },
    },
  },
  responses: {
    200: jsonDoc("What would happen.", ReassignmentPreview),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: errorDoc("The selection or strategy doesn't make sense (`invalid_reassignment`)."),
  },
});

export const createReassignmentRoute = createRoute({
  method: "post",
  path: "/scheduling/reassignments",
  operationId: "createSchedulingReassignment",
  tags: [TAG_REASSIGNMENTS],
  summary: "Start a bulk reassignment",
  description:
    "Moves up to 5,000 bookings in the background, each on its own, so one that can't move never holds up the rest. Nothing's ever cancelled: a booking nobody can take stays where it is, and its item says so. It answers at once: follow the run by its id, or wait for `scheduling.reassignment.completed`.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/reassignments"),
  request: {
    headers: ReassignmentIdempotency,
    body: {
      required: true,
      content: { "application/json": { schema: CreateReassignmentRequest } },
    },
  },
  responses: {
    202: createdBooking("The run, waiting to start.", ReassignmentObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    409: errorDoc("A request with this key is still running (`idempotency_in_progress`)."),
    422: errorDoc(
      "The selection or strategy doesn't make sense, or covers too many bookings (`invalid_reassignment`).",
    ),
  },
});

export const listReassignmentsRoute = createRoute({
  method: "get",
  path: "/scheduling/reassignments",
  operationId: "listSchedulingReassignments",
  tags: [TAG_REASSIGNMENTS],
  summary: "List bulk reassignments",
  description: "Newest first, with how each is going.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { query: PageQuery },
  responses: {
    200: jsonDoc("The runs.", ReassignmentList),
    ...commonErrors,
    422: invalid,
  },
});

export const getReassignmentRoute = createRoute({
  method: "get",
  path: "/scheduling/reassignments/{id}",
  operationId: "getSchedulingReassignment",
  tags: [TAG_REASSIGNMENTS],
  summary: "Retrieve a bulk reassignment",
  description: "How it's going.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: ReassignmentParams },
  responses: {
    200: jsonDoc("The run.", ReassignmentObject),
    ...commonErrors,
    404: notFound,
  },
});

export const listReassignmentItemsRoute = createRoute({
  method: "get",
  path: "/scheduling/reassignments/{id}/items",
  operationId: "listSchedulingReassignmentItems",
  tags: [TAG_REASSIGNMENTS],
  summary: "List a bulk reassignment's bookings",
  description:
    "Each booking it covers and what happened to it. A group session has one, for one of its seats. Empty until the worker's started on it.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: ReassignmentParams, query: PageQuery },
  responses: {
    200: jsonDoc("The items.", ReassignmentItemList),
    ...commonErrors,
    404: notFound,
    422: invalid,
  },
});

export const cancelReassignmentRoute = createRoute({
  method: "post",
  path: "/scheduling/reassignments/{id}/cancel",
  operationId: "cancelSchedulingReassignment",
  tags: [TAG_REASSIGNMENTS],
  summary: "Cancel a bulk reassignment",
  description:
    "Stops what hasn't happened yet. What's moved stays moved: undo it for that. Cancelling one that's finished changes nothing.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/reassignments/{id}/cancel"),
  request: { params: ReassignmentParams },
  responses: {
    200: jsonDoc("The run.", ReassignmentObject),
    ...commonErrors,
    404: notFound,
  },
});

export const undoReassignmentRoute = createRoute({
  method: "post",
  path: "/scheduling/reassignments/{id}/undo",
  operationId: "undoSchedulingReassignment",
  tags: [TAG_REASSIGNMENTS],
  summary: "Undo a bulk reassignment",
  description:
    "Gives back what a finished run moved, as a new run. A booking that's moved on since stays where it went, and a former host who's no longer free keeps it from going back, unless you pass `overrides`.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "POST /v1/scheduling/reassignments/{id}/undo"),
  request: {
    params: ReassignmentParams,
    body: {
      required: true,
      content: { "application/json": { schema: UndoReassignmentRequest } },
    },
  },
  responses: {
    202: jsonDoc("The new run.", ReassignmentObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: errorDoc("It's still running (`reassignment_not_finished`)."),
  },
});

const HolidayCalendarParams = z.object({
  id: z.string().meta({ description: "The holiday calendar's id." }),
});

export const createHolidayCalendarRoute = createRoute({
  method: "post",
  path: "/scheduling/holiday_calendars",
  operationId: "createSchedulingHolidayCalendar",
  tags: [TAG_HOLIDAY_CALENDARS],
  summary: "Create a holiday calendar",
  description:
    "Applies a country's public holidays, or your own feed, to some hosts as ordinary out of office entries, kept up to date by coss.com. A host who removes one keeps it removed.",
  security: [{ bearerAuth: [] }],
  middleware: writing("create", "POST /v1/scheduling/holiday_calendars"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateHolidayCalendarRequest } },
    },
  },
  responses: {
    201: jsonDoc("The calendar.", HolidayCalendarObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: errorDoc("That isn't something to read (`invalid_holiday_calendar`)."),
  },
});

export const listHolidayCalendarsRoute = createRoute({
  method: "get",
  path: "/scheduling/holiday_calendars",
  operationId: "listSchedulingHolidayCalendars",
  tags: [TAG_HOLIDAY_CALENDARS],
  summary: "List holiday calendars",
  description: "By name. A feed's URL is never shown again.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  responses: { 200: jsonDoc("The calendars.", HolidayCalendarList), ...commonErrors },
});

export const getHolidayCalendarRoute = createRoute({
  method: "get",
  path: "/scheduling/holiday_calendars/{id}",
  operationId: "getSchedulingHolidayCalendar",
  tags: [TAG_HOLIDAY_CALENDARS],
  summary: "Retrieve a holiday calendar",
  description: "With when it was last read, and why not if it couldn't be.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: HolidayCalendarParams },
  responses: {
    200: jsonDoc("The calendar.", HolidayCalendarObject),
    ...commonErrors,
    404: notFound,
  },
});

export const listHolidaysRoute = createRoute({
  method: "get",
  path: "/scheduling/holiday_calendars/{id}/holidays",
  operationId: "listSchedulingHolidays",
  tags: [TAG_HOLIDAY_CALENDARS],
  summary: "List a calendar's holidays",
  description: "What's coming, with names, as last read. Empty until its first read.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: HolidayCalendarParams },
  responses: { 200: jsonDoc("The holidays.", HolidayList), ...commonErrors, 404: notFound },
});

export const updateHolidayCalendarRoute = createRoute({
  method: "patch",
  path: "/scheduling/holiday_calendars/{id}",
  operationId: "updateSchedulingHolidayCalendar",
  tags: [TAG_HOLIDAY_CALENDARS],
  summary: "Update a holiday calendar",
  description: "Who it applies to, who covers and what happens to bookings. Takes effect shortly.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PATCH /v1/scheduling/holiday_calendars/{id}"),
  request: {
    params: HolidayCalendarParams,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateHolidayCalendarRequest } },
    },
  },
  responses: {
    200: jsonDoc("The calendar.", HolidayCalendarObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalid,
  },
});

export const deleteHolidayCalendarRoute = createRoute({
  method: "delete",
  path: "/scheduling/holiday_calendars/{id}",
  operationId: "deleteSchedulingHolidayCalendar",
  tags: [TAG_HOLIDAY_CALENDARS],
  summary: "Delete a holiday calendar",
  description: "Hosts can be booked on its days again, shortly: past entries stay.",
  security: [{ bearerAuth: [] }],
  middleware: writing("delete", "DELETE /v1/scheduling/holiday_calendars/{id}"),
  request: { params: HolidayCalendarParams },
  responses: {
    200: jsonDoc("It's going.", DeletedHolidayCalendar),
    ...commonErrors,
    404: notFound,
  },
});

export const createOutOfOfficeRoute = createRoute({
  method: "post",
  path: "/scheduling/out_of_office",
  operationId: "createSchedulingOutOfOffice",
  tags: [TAG_OUT_OF_OFFICE],
  summary: "Create out of office entries",
  description:
    "Marks one host, a list of hosts or everyone matching some attributes as away, for part of a " +
    "day or for whole dates. They aren't offered during it. Existing bookings stay as they are: " +
    "list them with the entry's conflicts.",
  security: [{ bearerAuth: [] }],
  middleware: writing("create", "POST /v1/scheduling/out_of_office"),
  request: {
    body: { required: true, content: { "application/json": { schema: CreateOutOfOfficeRequest } } },
  },
  responses: {
    201: jsonDoc("An entry per host.", OutOfOfficeList),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalid,
  },
});

export const listOutOfOfficeRoute = createRoute({
  method: "get",
  path: "/scheduling/out_of_office",
  operationId: "listSchedulingOutOfOffice",
  tags: [TAG_OUT_OF_OFFICE],
  summary: "List out of office entries",
  description: "The environment's entries, newest first.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { query: ListOutOfOfficeQuery },
  responses: {
    200: jsonDoc("A page of entries.", OutOfOfficeList),
    ...commonErrors,
    404: notFound,
    422: invalid,
  },
});

export const getOutOfOfficeRoute = createRoute({
  method: "get",
  path: "/scheduling/out_of_office/{id}",
  operationId: "getSchedulingOutOfOffice",
  tags: [TAG_OUT_OF_OFFICE],
  summary: "Retrieve an out of office entry",
  description: "One entry.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: OutOfOfficeParams },
  responses: { 200: jsonDoc("The entry.", OutOfOfficeObject), ...commonErrors, 404: notFound },
});

export const updateOutOfOfficeRoute = createRoute({
  method: "patch",
  path: "/scheduling/out_of_office/{id}",
  operationId: "updateSchedulingOutOfOffice",
  tags: [TAG_OUT_OF_OFFICE],
  summary: "Update an out of office entry",
  description: "Changes what's given. An entry stays with its host.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PATCH /v1/scheduling/out_of_office/{id}"),
  request: {
    params: OutOfOfficeParams,
    body: { required: true, content: { "application/json": { schema: UpdateOutOfOfficeRequest } } },
  },
  responses: {
    200: jsonDoc("The entry.", OutOfOfficeObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalid,
  },
});

export const putOutOfOfficeRoute = createRoute({
  method: "put",
  path: "/scheduling/out_of_office/by_external_id/{external_id}",
  operationId: "putSchedulingOutOfOffice",
  tags: [TAG_OUT_OF_OFFICE],
  summary: "Create or replace an entry by your own id",
  description:
    "For syncing from a system of record such as an HR tool: send what it says, as often as you " +
    "like, and there's one entry for it. Give every field you want to keep.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PUT /v1/scheduling/out_of_office/by_external_id/{external_id}"),
  request: {
    params: ExternalOutOfOfficeParams,
    body: { required: true, content: { "application/json": { schema: PutOutOfOfficeRequest } } },
  },
  responses: {
    200: jsonDoc("The entry, replaced.", OutOfOfficeObject),
    201: jsonDoc("The entry, new.", OutOfOfficeObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: invalid,
  },
});

export const deleteOutOfOfficeRoute = createRoute({
  method: "delete",
  path: "/scheduling/out_of_office/{id}",
  operationId: "deleteSchedulingOutOfOffice",
  tags: [TAG_OUT_OF_OFFICE],
  summary: "Delete an out of office entry",
  description: "The host can be booked in that time again, and any calendar event for it goes.",
  security: [{ bearerAuth: [] }],
  middleware: acting("delete"),
  request: { params: OutOfOfficeParams },
  responses: { 200: jsonDoc("Deleted.", DeletedOutOfOffice), ...commonErrors, 404: notFound },
});

export const listOutOfOfficeConflictsRoute = createRoute({
  method: "get",
  path: "/scheduling/out_of_office/{id}/conflicts",
  operationId: "listSchedulingOutOfOfficeConflicts",
  tags: [TAG_OUT_OF_OFFICE],
  summary: "List an entry's conflicts",
  description:
    "Live bookings of the host that fall in the entry, soonest first. Entries never change them.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  request: { params: OutOfOfficeParams, query: ConflictsQuery },
  responses: {
    200: jsonDoc("The bookings.", OutOfOfficeConflictList),
    ...commonErrors,
    404: notFound,
    422: invalid,
  },
});

export const getSettingsRoute = createRoute({
  method: "get",
  path: "/scheduling/settings",
  operationId: "getSchedulingSettings",
  tags: [TAG_SETTINGS],
  summary: "Retrieve settings",
  description: "The environment's scheduling settings.",
  security: [{ bearerAuth: [] }],
  middleware: read(),
  responses: { 200: jsonDoc("The settings.", SettingsObject), ...commonErrors },
});

export const updateSettingsRoute = createRoute({
  method: "patch",
  path: "/scheduling/settings",
  operationId: "updateSchedulingSettings",
  tags: [TAG_SETTINGS],
  summary: "Update settings",
  description: "Changes what's given.",
  security: [{ bearerAuth: [] }],
  middleware: writing("update", "PATCH /v1/scheduling/settings"),
  request: {
    body: { required: true, content: { "application/json": { schema: UpdateSettingsRequest } } },
  },
  responses: {
    200: jsonDoc("The settings.", SettingsObject),
    ...commonErrors,
    ...bodyErrors,
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), the logo isn't a PNG or JPEG " +
        "it can read (`invalid_logo`), an origin isn't https (`invalid_event_type`), or its text was " +
        "refused (`content_refused`).",
    ),
  },
});

function instant(value: string, param: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new ApiError(422, {
      type: "invalid_request_error",
      code: "invalid_time",
      message: `\`${param}\` isn't a valid time.`,
      param,
    });
  }
  return ms;
}

function attributesParam(value: string | undefined): Record<string, string | string[]> | undefined {
  if (!value) return undefined;
  try {
    const parsed = z
      .record(z.string(), z.union([z.string(), z.array(z.string())]))
      .parse(JSON.parse(value));
    return parsed;
  } catch {
    throw new ApiError(422, {
      type: "invalid_request_error",
      code: "validation_error",
      message: "`attributes` must be a JSON object of strings or lists of strings.",
      param: "attributes",
    });
  }
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Simulated connections need no provider, so they work where no calendars are configured. */
function localCalendarDeps(deps: SchedulingDeps): CalendarDeps {
  return {
    // With no apps nothing gets decrypted, and attendees' keys were never the ones to try.
    secretsKeys: NOT_CONFIGURED.dataKeys,
    apps: { google: null, microsoft: null },
    publicUrl: "http://localhost:3001",
    ...(deps.now ? { now: deps.now } : {}),
  };
}

const NOT_CONFIGURED: SchedulingDeps = {
  dataKeys: secretsKeyRing([Buffer.alloc(32)]),
  lookupKey: Buffer.alloc(32),
};

export function createSchedulingRoutes(configured: SchedulingDeps | null): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();
  const deps = configured ?? NOT_CONFIGURED;

  // Routes stay registered (they're the OpenAPI document), but none runs: `NOT_CONFIGURED` is never used.
  if (!configured) {
    router.use("/scheduling/*", () => {
      throw new SchedulingError(
        "scheduling_unavailable",
        "Scheduling isn't available in this deployment yet.",
      );
    });
  }

  const actorOf = (auth: { apiKeyId: string }): BookingActor => ({
    kind: "api_key",
    id: auth.apiKeyId,
  });

  router.openapi(createHostRoute, async (c) => {
    const host = await createHost(c.var.auth, c.req.valid("json"), {
      screen: deps.screenSetup,
      plans: deps.plans,
      billing: deps.billing,
    });
    await recordApiAudit(c, {
      action: "scheduling_host.created",
      target: { type: "scheduling_host", id: host.id, label: host.name },
    });
    return c.json(host, 201);
  });

  router.openapi(listHostsRoute, async (c) => {
    const page = await listHosts(c.var.auth, c.req.valid("query"));
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getHostRoute, async (c) =>
    c.json(await getHost(c.var.auth, c.req.valid("param").host), 200),
  );

  router.openapi(updateHostRoute, async (c) => {
    const host = await updateHost(c.var.auth, c.req.valid("param").host, c.req.valid("json"), {
      screen: deps.screenSetup,
    });
    await recordApiAudit(c, {
      action: "scheduling_host.updated",
      target: { type: "scheduling_host", id: host.id, label: host.name },
    });
    return c.json(host, 200);
  });

  router.openapi(deleteHostRoute, async (c) => {
    const { id } = await deleteHost(c.var.auth, c.req.valid("param").host, {
      billing: deps.billing,
    });
    await recordApiAudit(c, {
      action: "scheduling_host.deleted",
      target: { type: "scheduling_host", id },
    });
    return c.json({ object: "scheduling.host" as const, id, deleted: true as const }, 200);
  });

  router.openapi(reassignBookingRoute, async (c) => {
    const booking = await reassignBooking(
      c.var.auth,
      c.req.valid("param").id,
      c.req.valid("json"),
      deps,
      actorOf(c.var.auth),
    );
    await recordApiAudit(c, {
      action: "scheduling_booking.reassigned",
      target: { type: "scheduling_booking", id: booking.id },
    });
    return c.json(booking, 200);
  });

  router.openapi(listReassignCandidatesRoute, async (c) => {
    const query = c.req.valid("query");
    const fromHost = query.from_host
      ? (await resolveHost(db, c.var.auth, query.from_host)).id
      : undefined;
    const page = await listReassignCandidates(
      c.var.auth,
      c.req.valid("param").id,
      { fromHost },
      deps,
    );
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(previewReassignmentRoute, async (c) =>
    c.json(await previewReassignment(c.var.auth, c.req.valid("json"), deps), 200),
  );

  router.openapi(
    createReassignmentRoute,
    async (c) => {
      const { reassignment, replayed } = await createReassignment(
        c.var.auth,
        c.req.valid("json"),
        deps,
        actorOf(c.var.auth),
        { idempotencyKey: c.req.valid("header")["Idempotency-Key"] },
      );
      if (replayed) c.header("Idempotent-Replayed", "true");
      else {
        await recordApiAudit(c, {
          action: "scheduling_reassignment.created",
          target: { type: "scheduling_reassignment", id: reassignment.id },
        });
      }
      return c.json(reassignment, 202);
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(listReassignmentsRoute, async (c) => {
    const page = await listReassignments(c.var.auth, c.req.valid("query"));
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getReassignmentRoute, async (c) =>
    c.json(await getReassignment(c.var.auth, c.req.valid("param").id), 200),
  );

  router.openapi(listReassignmentItemsRoute, async (c) => {
    const page = await listReassignmentItems(
      c.var.auth,
      c.req.valid("param").id,
      c.req.valid("query"),
    );
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(cancelReassignmentRoute, async (c) => {
    const reassignment = await cancelReassignment(c.var.auth, c.req.valid("param").id, deps);
    await recordApiAudit(c, {
      action: "scheduling_reassignment.cancelled",
      target: { type: "scheduling_reassignment", id: reassignment.id },
    });
    return c.json(reassignment, 200);
  });

  router.openapi(undoReassignmentRoute, async (c) => {
    const reassignment = await undoReassignment(
      c.var.auth,
      c.req.valid("param").id,
      c.req.valid("json"),
      deps,
      actorOf(c.var.auth),
    );
    await recordApiAudit(c, {
      action: "scheduling_reassignment.undone",
      target: { type: "scheduling_reassignment", id: reassignment.id },
    });
    return c.json(reassignment, 202);
  });

  router.openapi(createHolidayCalendarRoute, async (c) => {
    await requireMovingBookings(c, c.req.valid("json").existing_bookings);
    const calendar = await createHolidayCalendar(c.var.auth, c.req.valid("json"), deps);
    await recordApiAudit(c, {
      action: "scheduling_holiday_calendar.created",
      target: { type: "scheduling_holiday_calendar", id: calendar.id },
    });
    return c.json(calendar, 201);
  });

  router.openapi(listHolidayCalendarsRoute, async (c) => {
    const page = await listHolidayCalendars(c.var.auth);
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getHolidayCalendarRoute, async (c) =>
    c.json(await getHolidayCalendar(c.var.auth, c.req.valid("param").id), 200),
  );

  router.openapi(listHolidaysRoute, async (c) =>
    c.json(
      {
        object: "list" as const,
        data: await listHolidays(c.var.auth, c.req.valid("param").id, deps),
        has_more: false,
      },
      200,
    ),
  );

  router.openapi(updateHolidayCalendarRoute, async (c) => {
    const calendar = await updateHolidayCalendar(
      c.var.auth,
      c.req.valid("param").id,
      c.req.valid("json"),
      deps,
    );
    await recordApiAudit(c, {
      action: "scheduling_holiday_calendar.updated",
      target: { type: "scheduling_holiday_calendar", id: calendar.id },
    });
    return c.json(calendar, 200);
  });

  router.openapi(deleteHolidayCalendarRoute, async (c) => {
    const removed = await deleteHolidayCalendar(c.var.auth, c.req.valid("param").id, deps);
    await recordApiAudit(c, {
      action: "scheduling_holiday_calendar.deleted",
      target: { type: "scheduling_holiday_calendar", id: removed.id },
    });
    return c.json(removed, 200);
  });

  router.openapi(createOutOfOfficeRoute, async (c) => {
    await requireMovingBookings(c, c.req.valid("json").existing_bookings);
    const data = await createOutOfOffice(
      c.var.auth,
      c.req.valid("json"),
      deps,
      actorOf(c.var.auth),
      "api",
    );
    for (const entry of data) {
      await recordApiAudit(c, {
        action: "scheduling_out_of_office.created",
        target: { type: "scheduling_out_of_office", id: entry.id },
      });
    }
    return c.json({ object: "list" as const, data, has_more: false }, 201);
  });

  router.openapi(listOutOfOfficeRoute, async (c) => {
    const query = c.req.valid("query");
    const host = query.host ? await resolveHost(db, c.var.auth, query.host) : null;
    const page = await listOutOfOffice(
      c.var.auth,
      {
        hostIds: host ? [host.id] : undefined,
        fromMs: query.start_after ? instant(query.start_after, "start_after") : undefined,
        toMs: query.start_before ? instant(query.start_before, "start_before") : undefined,
        group: query.group,
        limit: query.limit,
        after: query.after,
      },
      deps,
    );
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getOutOfOfficeRoute, async (c) =>
    c.json(await getOutOfOffice(c.var.auth, c.req.valid("param").id, deps), 200),
  );

  router.openapi(updateOutOfOfficeRoute, async (c) => {
    const entry = await updateOutOfOffice(
      c.var.auth,
      c.req.valid("param").id,
      c.req.valid("json"),
      deps,
      actorOf(c.var.auth),
    );
    await recordApiAudit(c, {
      action: "scheduling_out_of_office.updated",
      target: { type: "scheduling_out_of_office", id: entry.id },
    });
    return c.json(entry, 200);
  });

  router.openapi(putOutOfOfficeRoute, async (c) => {
    const { entry, created } = await putOutOfOffice(
      c.var.auth,
      c.req.valid("param").external_id,
      c.req.valid("json"),
      deps,
      actorOf(c.var.auth),
    );
    await recordApiAudit(c, {
      action: created ? "scheduling_out_of_office.created" : "scheduling_out_of_office.updated",
      target: { type: "scheduling_out_of_office", id: entry.id },
    });
    return created ? c.json(entry, 201) : c.json(entry, 200);
  });

  router.openapi(deleteOutOfOfficeRoute, async (c) => {
    const { id } = await deleteOutOfOffice(c.var.auth, c.req.valid("param").id, deps);
    await recordApiAudit(c, {
      action: "scheduling_out_of_office.deleted",
      target: { type: "scheduling_out_of_office", id },
    });
    return c.json({ object: "scheduling.out_of_office" as const, id, deleted: true as const }, 200);
  });

  router.openapi(listOutOfOfficeConflictsRoute, async (c) => {
    const page = await listOutOfOfficeConflicts(
      c.var.auth,
      c.req.valid("param").id,
      c.req.valid("query"),
      deps,
    );
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(createScheduleRoute, async (c) =>
    c.json(await createSchedule(c.var.auth, c.req.valid("param").host, c.req.valid("json")), 201),
  );

  router.openapi(listSchedulesRoute, async (c) => {
    const data = await listSchedules(c.var.auth, c.req.valid("param").host);
    return c.json({ object: "list" as const, data, has_more: false }, 200);
  });

  router.openapi(getScheduleRoute, async (c) => {
    const { host, schedule_id } = c.req.valid("param");
    return c.json(await getSchedule(c.var.auth, host, schedule_id), 200);
  });

  router.openapi(updateScheduleRoute, async (c) => {
    const { host, schedule_id } = c.req.valid("param");
    return c.json(await updateSchedule(c.var.auth, host, schedule_id, c.req.valid("json")), 200);
  });

  router.openapi(deleteScheduleRoute, async (c) => {
    const { host, schedule_id } = c.req.valid("param");
    const { id } = await deleteSchedule(c.var.auth, host, schedule_id);
    return c.json({ object: "scheduling.schedule" as const, id, deleted: true as const }, 200);
  });

  router.openapi(createEventTypeRoute, async (c) => {
    const eventType = await createEventType(c.var.auth, c.req.valid("json"), {
      screen: deps.screenSetup,
      plans: deps.plans,
    });
    await recordApiAudit(c, {
      action: "scheduling_event_type.created",
      target: { type: "scheduling_event_type", id: eventType.id, label: eventType.title },
    });
    return c.json(eventType, 201);
  });

  router.openapi(listEventTypesRoute, async (c) => {
    const page = await listEventTypes(c.var.auth, c.req.valid("query"));
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getEventTypeRoute, async (c) =>
    c.json(await getEventType(c.var.auth, c.req.valid("param").event_type), 200),
  );

  router.openapi(updateEventTypeRoute, async (c) => {
    const eventType = await updateEventType(
      c.var.auth,
      c.req.valid("param").event_type,
      c.req.valid("json"),
      { screen: deps.screenSetup, plans: deps.plans },
    );
    await recordApiAudit(c, {
      action: "scheduling_event_type.updated",
      target: { type: "scheduling_event_type", id: eventType.id, label: eventType.title },
    });
    return c.json(eventType, 200);
  });

  router.openapi(listSlotsRoute, async (c) => {
    const query = c.req.valid("query");
    await limitSchedulingSlots(c.var.rateLimiter, c.var.auth);
    await requireRouting(c.var.auth, deps.plans, attributesParam(query.attributes));
    const slots = await listEventTypeSlots(c.var.auth, {
      eventTypeRef: c.req.valid("param").event_type,
      fromMs: instant(query.start, "start"),
      toMs: instant(query.end, "end"),
      nowMs: (deps.now?.() ?? new Date()).getTime(),
      hostRef: query.host,
      attributes: attributesParam(query.attributes),
      durationMinutes: query.duration_minutes,
    });
    return c.json(
      {
        object: "list" as const,
        data: slots.map((slot) => ({
          start: iso(slot.startMs),
          end: iso(slot.endMs),
          hosts: slot.hostIds,
          seats_left: slot.seatsLeft,
        })),
        has_more: false as const,
      },
      200,
    );
  });

  router.openapi(explainSlotRoute, async (c) => {
    const query = c.req.valid("query");
    await limitSchedulingSlots(c.var.rateLimiter, c.var.auth);
    await requireRouting(c.var.auth, deps.plans, attributesParam(query.attributes));
    const explained = await explainSlot(c.var.auth, {
      eventTypeRef: c.req.valid("param").event_type,
      startMs: instant(query.start, "start"),
      nowMs: (deps.now?.() ?? new Date()).getTime(),
      hostRef: query.host,
      attributes: attributesParam(query.attributes),
      durationMinutes: query.duration_minutes,
    });
    return c.json(
      {
        object: "scheduling.slot_explanation" as const,
        start: iso(explained.startMs),
        end: iso(explained.endMs),
        available: explained.available,
        reason: explained.reason,
        hosts: explained.hosts.map((host) => ({
          host: host.hostId,
          role: host.required ? ("required" as const) : ("member" as const),
          available: host.available,
          reason: host.reason,
          calendar_reason: host.calendarReason,
        })),
      },
      200,
    );
  });

  router.openapi(searchAvailabilityRoute, async (c) => {
    const body = c.req.valid("json");
    await limitSchedulingSlots(c.var.rateLimiter, c.var.auth);
    await requireRouting(c.var.auth, deps.plans, body.attributes);
    const { organizationId, mode } = c.var.auth;
    const found = await searchAvailability(c.var.auth, {
      eventTypeRef: body.event_type,
      fromMs: instant(body.start, "start"),
      toMs: instant(body.end, "end"),
      nowMs: (deps.now?.() ?? new Date()).getTime(),
      attributes: body.attributes,
      hostRefs: body.hosts,
      slotsPerHost: body.slots_per_host,
      limit: body.limit,
      maxHosts:
        mode === "live"
          ? await deps.plans?.currentLimit(organizationId, "schedulingSearchHosts")
          : null,
    });
    return c.json(
      {
        object: "list" as const,
        data: found.data.map((row) => ({
          host: row.hostId,
          uid: row.uid,
          slots: row.slots.map((slot) => ({ start: iso(slot.startMs), end: iso(slot.endMs) })),
        })),
        has_more: found.hasMore,
      },
      200,
    );
  });

  const bookingRequest = (
    body: z.output<typeof CreateBookingRequest>,
    idempotencyKey: string | undefined,
  ) => ({
    gateRouting: true,
    eventType: body.event_type,
    startMs: instant(body.start, "start"),
    host: body.host,
    attributes: body.attributes,
    durationMinutes: body.duration_minutes,
    attendee: body.attendee,
    guests: body.guests,
    answers: body.answers,
    location: body.location,
    metadata: body.metadata,
    idempotencyKey,
  });

  router.openapi(
    createBookingRoute,
    async (c) => {
      const { booking, replayed } = await createBooking(
        c.var.auth,
        bookingRequest(c.req.valid("json"), c.req.valid("header")["Idempotency-Key"]),
        deps,
        actorOf(c.var.auth),
      );
      if (replayed) c.header("Idempotent-Replayed", "true");
      return c.json(booking, 201);
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(listBookingsRoute, async (c) => {
    const query = c.req.valid("query");
    const page = await listBookings(
      c.var.auth,
      {
        limit: query.limit,
        after: query.after,
        hostRef: query.host,
        eventTypeRef: query.event_type,
        status: query.status,
        attendeeUid: query.attendee_uid,
        startAfter: query.start_after
          ? new Date(instant(query.start_after, "start_after"))
          : undefined,
        startBefore: query.start_before
          ? new Date(instant(query.start_before, "start_before"))
          : undefined,
      },
      deps,
    );
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getBookingRoute, async (c) =>
    c.json(await getBooking(c.var.auth, c.req.valid("param").id, deps), 200),
  );

  router.openapi(rescheduleBookingRoute, async (c) => {
    const body = c.req.valid("json");
    return c.json(
      await rescheduleBooking(
        c.var.auth,
        c.req.valid("param").id,
        { startMs: instant(body.start, "start"), host: body.host },
        deps,
        actorOf(c.var.auth),
      ),
      200,
    );
  });

  router.openapi(cancelBookingRoute, async (c) => {
    const body = c.req.valid("json") as { reason?: string } | undefined;
    return c.json(
      await cancelBooking(c.var.auth, c.req.valid("param").id, deps, actorOf(c.var.auth), {
        reason: body?.reason,
      }),
      200,
    );
  });

  router.openapi(listBookingEventsRoute, async (c) => {
    const { data, hasMore } = await listBookingEvents(
      c.var.auth,
      c.req.valid("param").id,
      c.req.valid("query"),
    );
    return c.json({ object: "list" as const, data, has_more: hasMore }, 200);
  });

  router.openapi(approveBookingRoute, async (c) =>
    c.json(
      await approveBooking(c.var.auth, c.req.valid("param").id, deps, actorOf(c.var.auth)),
      200,
    ),
  );

  router.openapi(declineBookingRoute, async (c) =>
    c.json(
      await declineBooking(c.var.auth, c.req.valid("param").id, deps, actorOf(c.var.auth)),
      200,
    ),
  );

  router.openapi(noShowBookingRoute, async (c) =>
    c.json(await markNoShow(c.var.auth, c.req.valid("param").id, deps, actorOf(c.var.auth)), 200),
  );

  router.openapi(updateBookingLocationRoute, async (c) =>
    c.json(
      await updateBookingLocation(
        c.var.auth,
        c.req.valid("param").id,
        c.req.valid("json").location,
        deps,
        actorOf(c.var.auth),
      ),
      200,
    ),
  );

  router.openapi(
    createHoldRoute,
    async (c) => {
      const { booking, replayed } = await createHold(
        c.var.auth,
        bookingRequest(c.req.valid("json"), c.req.valid("header")["Idempotency-Key"]),
        deps,
        actorOf(c.var.auth),
      );
      if (replayed) c.header("Idempotent-Replayed", "true");
      return c.json(booking, 201);
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(confirmHoldRoute, async (c) =>
    c.json(
      await confirmHold(
        c.var.auth,
        c.req.valid("param").id,
        { ifStillFree: c.req.valid("json").if_still_free },
        deps,
        actorOf(c.var.auth),
      ),
      200,
    ),
  );

  router.openapi(releaseHoldRoute, async (c) =>
    c.json(await deleteHold(c.var.auth, c.req.valid("param").id, deps, actorOf(c.var.auth)), 200),
  );

  const seriesRequest = (
    body: z.output<typeof CreateSeriesRequest>,
    idempotencyKey: string | undefined,
  ) => ({
    ...bookingRequest(body, idempotencyKey),
    recurrence: body.recurrence,
    onConflict: body.on_conflict,
  });

  router.openapi(
    createSeriesRoute,
    async (c) => {
      const { result, replayed } = await createSeries(
        c.var.auth,
        seriesRequest(c.req.valid("json"), c.req.valid("header")["Idempotency-Key"]),
        deps,
        actorOf(c.var.auth),
      );
      if (replayed) c.header("Idempotent-Replayed", "true");
      return c.json(
        {
          object: "scheduling.series" as const,
          id: result.seriesId,
          bookings: result.bookings,
          conflicts: result.conflicts,
        },
        201,
      );
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(previewSeriesRoute, async (c) => {
    await requireRouting(c.var.auth, deps.plans, c.req.valid("json").attributes);
    const data = await previewSeries(
      c.var.auth,
      seriesRequest(c.req.valid("json"), undefined),
      deps,
    );
    return c.json({ object: "list" as const, data, has_more: false as const }, 200);
  });

  router.openapi(cancelSeriesRoute, async (c) => {
    const data = await cancelSeries(
      c.var.auth,
      c.req.valid("param").id,
      { fromIndex: c.req.valid("json").from_index },
      deps,
      actorOf(c.var.auth),
    );
    return c.json({ object: "list" as const, data, has_more: false as const }, 200);
  });

  router.openapi(eraseAttendeeRoute, async (c) => {
    const { uid } = c.req.valid("param");
    const erased = await eraseAttendee(c.var.auth, { uid });
    await recordApiAudit(c, {
      action: "scheduling_attendee.erased",
      target: { type: "scheduling_attendee", id: uid },
    });
    return c.json({ object: "scheduling.attendee_erasure" as const, uid, erased }, 200);
  });

  router.openapi(eraseAttendeeByEmailRoute, async (c) => {
    const erased = await eraseAttendeeByEmail(c.var.auth, c.req.valid("json"), deps);
    // The address is what's being forgotten, so the audit log doesn't keep it.
    await recordApiAudit(c, {
      action: "scheduling_attendee.erased",
      target: { type: "scheduling_attendee", id: "by_email" },
    });
    return c.json({ object: "scheduling.attendee_erasure" as const, erased }, 200);
  });

  const calendars = (): CalendarDeps => {
    if (!deps.calendars) {
      throw new SchedulingError(
        "calendar_unavailable",
        "Connecting calendars isn't set up in this deployment.",
      );
    }
    return deps.calendars;
  };

  /** A return URL only goes back to a site the customer named: never an open redirect. */
  const checkedReturnUrl = async (
    auth: { organizationId: string; environmentId: string; mode: "live" | "sandbox" },
    value: string | undefined,
  ): Promise<string | null> => {
    if (!value) return null;
    const settings = await getSettingsRow(auth);
    const origin = new URL(value).origin;
    const local =
      auth.mode === "sandbox" && /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin);
    if (!local && !settings?.allowedOrigins.includes(origin)) {
      throw new SchedulingError(
        "invalid_event_type",
        `${origin} isn't one of this environment's allowed origins.`,
        { param: "return_url" },
      );
    }
    return value;
  };

  router.openapi(authorizeCalendarRoute, async (c) => {
    const body = c.req.valid("json");
    const { url } = await startCalendarAuthorization(
      c.var.auth,
      c.req.valid("param").host,
      {
        provider: body.provider,
        returnUrl: await checkedReturnUrl(c.var.auth, body.return_url),
      },
      calendars(),
    );
    return c.json({ object: "scheduling.calendar_authorization" as const, url }, 200);
  });

  router.openapi(createCalendarConnectionRoute, async (c) => {
    const body = c.req.valid("json");
    const { host } = c.req.valid("param");
    const connection =
      body.provider === "simulated"
        ? await connectSimulated(c.var.auth, host, { now: deps.now })
        : await connectCaldav(
            c.var.auth,
            host,
            { url: body.url, username: body.username, password: body.password },
            calendars(),
          );
    return c.json(await toConnectionObject(connection), 201);
  });

  router.openapi(listCalendarConnectionsRoute, async (c) => {
    const data = await listConnections(c.var.auth, c.req.valid("param").host);
    return c.json({ object: "list" as const, data, has_more: false }, 200);
  });

  router.openapi(deleteCalendarConnectionRoute, async (c) => {
    const { host, id } = c.req.valid("param");
    await disconnectCalendar(c.var.auth, host, id, deps.calendars ?? localCalendarDeps(deps));
    return c.json(
      { object: "scheduling.calendar_connection" as const, id, deleted: true as const },
      200,
    );
  });

  router.openapi(updateCalendarRoute, async (c) => {
    const { host, calendar_id } = c.req.valid("param");
    const data = await updateCalendar(c.var.auth, host, calendar_id, c.req.valid("json"));
    return c.json({ object: "list" as const, data, has_more: false }, 200);
  });

  router.openapi(createCalendarDelegationRoute, async (c) => {
    const delegation = await createCalendarDelegation(c.var.auth, c.req.valid("json"), {
      ...calendars(),
      plans: c.var.plans ?? undefined,
    });
    await recordApiAudit(c, {
      action: "scheduling_calendar_delegation.created",
      target: {
        type: "scheduling_calendar_delegation",
        id: delegation.id,
        label: delegation.domain,
      },
    });
    return c.json(delegation, 201);
  });

  router.openapi(listCalendarDelegationsRoute, async (c) => {
    const data = await listCalendarDelegations(c.var.auth);
    return c.json({ object: "list" as const, data, has_more: false }, 200);
  });

  router.openapi(getCalendarDelegationRoute, async (c) =>
    c.json(await getCalendarDelegation(c.var.auth, c.req.valid("param").id), 200),
  );

  router.openapi(updateCalendarDelegationRoute, async (c) => {
    const delegation = await updateCalendarDelegation(
      c.var.auth,
      c.req.valid("param").id,
      c.req.valid("json"),
      { ...calendars(), plans: c.var.plans ?? undefined },
    );
    await recordApiAudit(c, {
      action: "scheduling_calendar_delegation.updated",
      target: {
        type: "scheduling_calendar_delegation",
        id: delegation.id,
        label: delegation.domain,
      },
    });
    return c.json(delegation, 200);
  });

  router.openapi(verifyCalendarDelegationRoute, async (c) => {
    const delegation = await verifyCalendarDelegation(
      c.var.auth,
      c.req.valid("param").id,
      c.req.valid("json"),
      { ...calendars(), plans: c.var.plans ?? undefined },
    );
    await recordApiAudit(c, {
      action: "scheduling_calendar_delegation.verified",
      target: {
        type: "scheduling_calendar_delegation",
        id: delegation.id,
        label: delegation.domain,
      },
    });
    return c.json(delegation, 200);
  });

  router.openapi(deleteCalendarDelegationRoute, async (c) => {
    const { id } = await deleteCalendarDelegation(c.var.auth, c.req.valid("param").id, {
      now: deps.now,
    });
    await recordApiAudit(c, {
      action: "scheduling_calendar_delegation.deleted",
      target: { type: "scheduling_calendar_delegation", id },
    });
    return c.json(
      { object: "scheduling.calendar_delegation" as const, id, deleted: true as const },
      200,
    );
  });

  router.openapi(setSimulatedBusyRoute, async (c) => {
    await setSimulatedBusy(
      c.var.auth,
      c.req.valid("param").host,
      c.req.valid("json").intervals.map((interval) => ({
        startMs: instant(interval.start, "start"),
        endMs: instant(interval.end, "end"),
      })),
    );
    return c.body(null, 204);
  });

  const sessionBody = (session: {
    id: string;
    token: string;
    url: string | null;
    expiresAt: Date;
  }) => ({
    object: "scheduling.session" as const,
    id: session.id,
    token: session.token,
    url: session.url,
    expires_at: session.expiresAt.toISOString(),
  });

  router.openapi(createManagerSessionRoute, async (c) => {
    const body = c.req.valid("json");
    const session = await createManagerSession(c.var.auth, {
      plans: deps.plans,
      hosts: body.hosts,
      hostFilter: body.host_filter,
      expiresIn: body.expires_in,
      readOnly: body.read_only,
      apiKeyId: c.var.auth.apiKeyId,
      publicUrl: deps.publicUrl ?? null,
    });
    return c.json(sessionBody(session), 201);
  });

  router.openapi(createHostSessionRoute, async (c) => {
    const body = c.req.valid("json");
    const session = await createHostSession(c.var.auth, {
      host: c.req.valid("param").host,
      expiresIn: body.expires_in,
      readOnly: body.read_only,
      apiKeyId: c.var.auth.apiKeyId,
      publicUrl: deps.publicUrl ?? null,
      plans: deps.plans,
    });
    return c.json(sessionBody(session), 201);
  });

  router.openapi(createBookerSessionRoute, async (c) => {
    const body = c.req.valid("json");
    await requireRouting(c.var.auth, deps.plans, body.attributes);
    const session = await createBookerSession(
      c.var.auth,
      {
        eventType: body.event_type,
        host: body.host,
        attributes: body.attributes,
        attendee: body.attendee,
        expiresIn: body.expires_in,
        apiKeyId: c.var.auth.apiKeyId,
        publicUrl: deps.publicUrl ?? null,
      },
      deps,
    );
    return c.json(sessionBody(session), 201);
  });

  router.openapi(createManageSessionRoute, async (c) => {
    const session = await createManageSession(c.var.auth, {
      bookingId: c.req.valid("param").id,
      apiKeyId: c.var.auth.apiKeyId,
      publicUrl: deps.publicUrl ?? null,
    });
    return c.json(sessionBody(session), 201);
  });

  router.openapi(getSettingsRoute, async (c) => c.json(await getSettings(c.var.auth), 200));

  router.openapi(updateSettingsRoute, async (c) => {
    const settings = await updateSettings(c.var.auth, c.req.valid("json"), {
      screen: deps.screenSetup,
    });
    await recordApiAudit(c, {
      action: "scheduling_settings.updated",
      target: { type: "scheduling_settings", id: c.var.auth.environmentId },
    });
    return c.json(settings, 200);
  });

  return router;
}
