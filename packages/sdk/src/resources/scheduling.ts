import type { CossResult } from "../core/errors.ts";
import type { HttpClient, RequestOptions } from "../core/http.ts";
import type { List } from "../types/email.ts";
import type {
  AuthorizeSchedulingCalendarParams,
  CancelSchedulingSeriesParams,
  ConfirmSchedulingHoldParams,
  CreateSchedulingBookerSessionParams,
  CreateSchedulingBookingParams,
  CreateSchedulingCalendarConnectionParams,
  CreateSchedulingEventTypeParams,
  CreateSchedulingHoldParams,
  CreateSchedulingHostParams,
  CreateSchedulingHostSessionParams,
  CreateSchedulingSeriesParams,
  DeletedSchedulingCalendarConnection,
  DeletedSchedulingHost,
  DeletedSchedulingSchedule,
  ListSchedulingBookingsParams,
  ListSchedulingSlotsParams,
  RescheduleSchedulingBookingParams,
  SchedulingAttendeeEmailErasure,
  SchedulingAttendeeErasure,
  SchedulingAvailabilitySearchResult,
  SchedulingBooking,
  SchedulingBookingNotification,
  SchedulingCalendarAuthorization,
  SchedulingCalendarConnection,
  SchedulingCancelledSeries,
  SchedulingEventType,
  SchedulingHost,
  SchedulingPageParams,
  SchedulingSchedule,
  SchedulingSeries,
  SchedulingSeriesPreview,
  SchedulingSession,
  SchedulingSettings,
  SchedulingSlotList,
  SearchSchedulingAvailabilityParams,
  SetSchedulingSimulatedBusyParams,
  UpdateSchedulingBookingLocationParams,
  UpdateSchedulingCalendarParams,
  UpdateSchedulingEventTypeParams,
  UpdateSchedulingHostParams,
  UpdateSchedulingSettingsParams,
  UpsertSchedulingScheduleParams,
} from "../types/scheduling.ts";
import { listQuery } from "./list-query.ts";

type ReadOptions = Pick<RequestOptions, "signal">;
type WriteOptions = Pick<RequestOptions, "signal" | "idempotencyKey">;

const part = encodeURIComponent;

/** `coss.scheduling.hosts`: the people who can be booked. */
export class SchedulingHostsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.hosts`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Creates a host. Not retried automatically: a retry would create a second one. */
  create(
    params: CreateSchedulingHostParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingHost>> {
    return this.#http.request<SchedulingHost>({
      method: "POST",
      path: "/v1/scheduling/hosts",
      body: params,
      retry: false,
      signal: options?.signal,
    });
  }

  /** Lists hosts, newest first. Pass the last `id` as `after` while `has_more` is true. */
  list(
    params: SchedulingPageParams = {},
    options?: ReadOptions,
  ): Promise<CossResult<List<SchedulingHost>>> {
    return this.#http.request<List<SchedulingHost>>({
      method: "GET",
      path: "/v1/scheduling/hosts",
      query: listQuery(params),
      signal: options?.signal,
    });
  }

  /** Retrieves a host by its id or your uid. */
  get(host: string, options?: ReadOptions): Promise<CossResult<SchedulingHost>> {
    return this.#http.request<SchedulingHost>({
      method: "GET",
      path: `/v1/scheduling/hosts/${part(host)}`,
      signal: options?.signal,
    });
  }

  /** Changes what's given. A `disabled` host keeps its bookings but gets no new ones. */
  update(
    host: string,
    params: UpdateSchedulingHostParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingHost>> {
    return this.#http.request<SchedulingHost>({
      method: "PATCH",
      path: `/v1/scheduling/hosts/${part(host)}`,
      body: params,
      signal: options?.signal,
    });
  }

  /** Deletes a host. Refused while bookings are still to come. */
  remove(host: string, options?: ReadOptions): Promise<CossResult<DeletedSchedulingHost>> {
    return this.#http.request<DeletedSchedulingHost>({
      method: "DELETE",
      path: `/v1/scheduling/hosts/${part(host)}`,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.schedules`: a host's weekly hours and date overrides. */
export class SchedulingSchedulesResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.schedules`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Creates a schedule; a host's first is its default. Not retried automatically. */
  create(
    host: string,
    params: UpsertSchedulingScheduleParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingSchedule>> {
    return this.#http.request<SchedulingSchedule>({
      method: "POST",
      path: `/v1/scheduling/hosts/${part(host)}/schedules`,
      body: params,
      retry: false,
      signal: options?.signal,
    });
  }

  /** Lists a host's schedules, oldest first. */
  list(host: string, options?: ReadOptions): Promise<CossResult<List<SchedulingSchedule>>> {
    return this.#http.request<List<SchedulingSchedule>>({
      method: "GET",
      path: `/v1/scheduling/hosts/${part(host)}/schedules`,
      signal: options?.signal,
    });
  }

  /** Retrieves one schedule. */
  get(host: string, id: string, options?: ReadOptions): Promise<CossResult<SchedulingSchedule>> {
    return this.#http.request<SchedulingSchedule>({
      method: "GET",
      path: `/v1/scheduling/hosts/${part(host)}/schedules/${part(id)}`,
      signal: options?.signal,
    });
  }

  /** Replaces its rules, and its overrides when given. Existing bookings stay. */
  update(
    host: string,
    id: string,
    params: UpsertSchedulingScheduleParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingSchedule>> {
    return this.#http.request<SchedulingSchedule>({
      method: "PUT",
      path: `/v1/scheduling/hosts/${part(host)}/schedules/${part(id)}`,
      body: params,
      signal: options?.signal,
    });
  }

  /** Deletes a schedule. Refused for the host's default. */
  remove(
    host: string,
    id: string,
    options?: ReadOptions,
  ): Promise<CossResult<DeletedSchedulingSchedule>> {
    return this.#http.request<DeletedSchedulingSchedule>({
      method: "DELETE",
      path: `/v1/scheduling/hosts/${part(host)}/schedules/${part(id)}`,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.eventTypes`: what can be booked. */
export class SchedulingEventTypesResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.eventTypes`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Creates an event type. Not retried automatically: a retry would create a second one. */
  create(
    params: CreateSchedulingEventTypeParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingEventType>> {
    return this.#http.request<SchedulingEventType>({
      method: "POST",
      path: "/v1/scheduling/event_types",
      body: params,
      retry: false,
      signal: options?.signal,
    });
  }

  /** Lists event types, newest first. */
  list(
    params: SchedulingPageParams = {},
    options?: ReadOptions,
  ): Promise<CossResult<List<SchedulingEventType>>> {
    return this.#http.request<List<SchedulingEventType>>({
      method: "GET",
      path: "/v1/scheduling/event_types",
      query: listQuery(params),
      signal: options?.signal,
    });
  }

  /** Retrieves an event type by its id or your uid. */
  get(eventType: string, options?: ReadOptions): Promise<CossResult<SchedulingEventType>> {
    return this.#http.request<SchedulingEventType>({
      method: "GET",
      path: `/v1/scheduling/event_types/${part(eventType)}`,
      signal: options?.signal,
    });
  }

  /** Changes what's given. Existing bookings keep what they were booked with. */
  update(
    eventType: string,
    params: UpdateSchedulingEventTypeParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingEventType>> {
    return this.#http.request<SchedulingEventType>({
      method: "PATCH",
      path: `/v1/scheduling/event_types/${part(eventType)}`,
      body: params,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.slots`: which times an event type can be booked. */
export class SchedulingSlotsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.slots`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Starts an attendee can book between `start` and `end`, as UTC instants. */
  list(
    eventType: string,
    params: ListSchedulingSlotsParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingSlotList>> {
    return this.#http.request<SchedulingSlotList>({
      method: "GET",
      path: `/v1/scheduling/event_types/${part(eventType)}/slots`,
      query: listQuery(params),
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.availability`: who's free, across hosts. */
export class SchedulingAvailabilityResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.availability`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Each matching host's soonest slots, soonest first, across up to 500 hosts. */
  search(
    params: SearchSchedulingAvailabilityParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingAvailabilitySearchResult>> {
    return this.#http.request<SchedulingAvailabilitySearchResult>({
      method: "POST",
      path: "/v1/scheduling/availability/search",
      body: params,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.bookings`. */
export class SchedulingBookingsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.bookings`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Books a slot. Retried safely: every attempt carries the same `Idempotency-Key`. */
  create(
    params: CreateSchedulingBookingParams,
    options?: WriteOptions,
  ): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "POST",
      path: "/v1/scheduling/bookings",
      body: params,
      idempotencyKey: options?.idempotencyKey,
      signal: options?.signal,
    });
  }

  /** Lists bookings, newest first, without answers. */
  list(
    params: ListSchedulingBookingsParams = {},
    options?: ReadOptions,
  ): Promise<CossResult<List<SchedulingBooking>>> {
    return this.#http.request<List<SchedulingBooking>>({
      method: "GET",
      path: "/v1/scheduling/bookings",
      query: listQuery(params),
      signal: options?.signal,
    });
  }

  /** Retrieves a booking with its attendees and their answers. */
  get(id: string, options?: ReadOptions): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "GET",
      path: `/v1/scheduling/bookings/${part(id)}`,
      signal: options?.signal,
    });
  }

  /** Moves a booking, keeping its id. The old time stays booked if the new one isn't free. */
  reschedule(
    id: string,
    params: RescheduleSchedulingBookingParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "POST",
      path: `/v1/scheduling/bookings/${part(id)}/reschedule`,
      body: params,
      signal: options?.signal,
    });
  }

  /** Cancels a booking and frees the time. */
  cancel(id: string, options?: ReadOptions): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "POST",
      path: `/v1/scheduling/bookings/${part(id)}/cancel`,
      signal: options?.signal,
    });
  }

  /** Confirms a `pending_approval` booking. */
  approve(id: string, options?: ReadOptions): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "POST",
      path: `/v1/scheduling/bookings/${part(id)}/approve`,
      signal: options?.signal,
    });
  }

  /** Refuses a `pending_approval` booking and frees the time. */
  decline(id: string, options?: ReadOptions): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "POST",
      path: `/v1/scheduling/bookings/${part(id)}/decline`,
      signal: options?.signal,
    });
  }

  /** What's been queued for this booking and what became of it, including why something wasn't sent. */
  notifications(
    id: string,
    options?: ReadOptions,
  ): Promise<CossResult<List<SchedulingBookingNotification>>> {
    return this.#http.request<List<SchedulingBookingNotification>>({
      method: "GET",
      path: `/v1/scheduling/bookings/${part(id)}/notifications`,
      signal: options?.signal,
    });
  }

  /** Records that the attendee didn't come, once the booking has started. Marking it again changes nothing. */
  markNoShow(id: string, options?: ReadOptions): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "POST",
      path: `/v1/scheduling/bookings/${part(id)}/no_show`,
      signal: options?.signal,
    });
  }

  /** Sets where it happens, such as the meeting link you made after the webhook. */
  updateLocation(
    id: string,
    params: UpdateSchedulingBookingLocationParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "PATCH",
      path: `/v1/scheduling/bookings/${part(id)}/location`,
      body: params,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.holds`: keep a slot while you take payment. */
export class SchedulingHoldsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.holds`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Holds a slot: a `held` booking, which isn't charged and sends nothing. */
  create(
    params: CreateSchedulingHoldParams,
    options?: WriteOptions,
  ): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "POST",
      path: "/v1/scheduling/holds",
      body: params,
      idempotencyKey: options?.idempotencyKey,
      signal: options?.signal,
    });
  }

  /** Turns a hold into a booking. Repeating it is safe. */
  confirm(
    id: string,
    params: ConfirmSchedulingHoldParams = {},
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "POST",
      path: `/v1/scheduling/holds/${part(id)}/confirm`,
      body: params,
      signal: options?.signal,
    });
  }

  /** Gives the slot back early. */
  release(id: string, options?: ReadOptions): Promise<CossResult<SchedulingBooking>> {
    return this.#http.request<SchedulingBooking>({
      method: "DELETE",
      path: `/v1/scheduling/holds/${part(id)}`,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.series`: recurring bookings. */
export class SchedulingSeriesResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.series`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Books up to 52 occurrences, keeping the attendee's local time across DST changes. */
  create(
    params: CreateSchedulingSeriesParams,
    options?: WriteOptions,
  ): Promise<CossResult<SchedulingSeries>> {
    return this.#http.request<SchedulingSeries>({
      method: "POST",
      path: "/v1/scheduling/series",
      body: params,
      idempotencyKey: options?.idempotencyKey,
      signal: options?.signal,
    });
  }

  /** Which occurrences would be free, without booking anything. */
  preview(
    params: CreateSchedulingSeriesParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingSeriesPreview>> {
    return this.#http.request<SchedulingSeriesPreview>({
      method: "POST",
      path: "/v1/scheduling/series/preview",
      body: params,
      signal: options?.signal,
    });
  }

  /** Cancels the occurrences from `from_index` on, or all of them. */
  cancel(
    id: string,
    params: CancelSchedulingSeriesParams = {},
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingCancelledSeries>> {
    return this.#http.request<SchedulingCancelledSeries>({
      method: "POST",
      path: `/v1/scheduling/series/${part(id)}/cancel`,
      body: params,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.calendars`: a host's connected calendars. */
export class SchedulingCalendarsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.calendars`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** A URL for the host to give consent at Google or Microsoft. Open it in a new window. */
  authorize(
    host: string,
    params: AuthorizeSchedulingCalendarParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingCalendarAuthorization>> {
    return this.#http.request<SchedulingCalendarAuthorization>({
      method: "POST",
      path: `/v1/scheduling/hosts/${part(host)}/calendar_connections/authorize`,
      body: params,
      signal: options?.signal,
    });
  }

  /** Connects CalDAV with an app password, or a `simulated` calendar in a sandbox. */
  connect(
    host: string,
    params: CreateSchedulingCalendarConnectionParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingCalendarConnection>> {
    return this.#http.request<SchedulingCalendarConnection>({
      method: "POST",
      path: `/v1/scheduling/hosts/${part(host)}/calendar_connections`,
      body: params,
      signal: options?.signal,
    });
  }

  /** A host's connections, with their calendars and which of them count. */
  list(
    host: string,
    options?: ReadOptions,
  ): Promise<CossResult<List<SchedulingCalendarConnection>>> {
    return this.#http.request<List<SchedulingCalendarConnection>>({
      method: "GET",
      path: `/v1/scheduling/hosts/${part(host)}/calendar_connections`,
      signal: options?.signal,
    });
  }

  /** Revokes coss.com's access and deletes every busy time read through it. */
  disconnect(
    host: string,
    id: string,
    options?: ReadOptions,
  ): Promise<CossResult<DeletedSchedulingCalendarConnection>> {
    return this.#http.request<DeletedSchedulingCalendarConnection>({
      method: "DELETE",
      path: `/v1/scheduling/hosts/${part(host)}/calendar_connections/${part(id)}`,
      signal: options?.signal,
    });
  }

  /** Whether a calendar's busy times block slots, and whether bookings are written to it. */
  update(
    host: string,
    calendarId: string,
    params: UpdateSchedulingCalendarParams,
    options?: ReadOptions,
  ): Promise<CossResult<List<SchedulingCalendarConnection>>> {
    return this.#http.request<List<SchedulingCalendarConnection>>({
      method: "PATCH",
      path: `/v1/scheduling/hosts/${part(host)}/calendars/${part(calendarId)}`,
      body: params,
      signal: options?.signal,
    });
  }

  /** Sandbox only: replaces a simulated calendar's busy times. */
  setSimulatedBusy(
    host: string,
    params: SetSchedulingSimulatedBusyParams,
    options?: ReadOptions,
  ): Promise<CossResult<null>> {
    return this.#http.request<null>({
      method: "PUT",
      path: `/v1/scheduling/hosts/${part(host)}/simulated_busy`,
      body: params,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.sessions`: a browser's authority, without your API key. */
export class SchedulingSessionsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.sessions`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Lets one host manage their own hours and calendars. Not retried: each one's a new token. */
  createForHost(
    host: string,
    params: CreateSchedulingHostSessionParams = {},
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingSession>> {
    return this.#http.request<SchedulingSession>({
      method: "POST",
      path: `/v1/scheduling/hosts/${part(host)}/sessions`,
      body: params,
      retry: false,
      signal: options?.signal,
    });
  }

  /** Lets a browser book one event type. Not retried: each one's a new token. */
  createForBooker(
    params: CreateSchedulingBookerSessionParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingSession>> {
    return this.#http.request<SchedulingSession>({
      method: "POST",
      path: "/v1/scheduling/booker_sessions",
      body: params,
      retry: false,
      signal: options?.signal,
    });
  }

  /** Lets an attendee reschedule or cancel one booking. Not retried: each one's a new token. */
  createForBooking(id: string, options?: ReadOptions): Promise<CossResult<SchedulingSession>> {
    return this.#http.request<SchedulingSession>({
      method: "POST",
      path: `/v1/scheduling/bookings/${part(id)}/manage_sessions`,
      retry: false,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.attendees`. */
export class SchedulingAttendeesResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.attendees`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Removes this address's details and answers from every booking now: all there is of a guest. */
  eraseByEmail(
    email: string,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingAttendeeEmailErasure>> {
    return this.#http.request<SchedulingAttendeeEmailErasure>({
      method: "POST",
      path: "/v1/scheduling/attendees/erase",
      body: { email },
      ...options,
    });
  }

  /** Removes this person's details and answers from every booking now. */
  erase(uid: string, options?: ReadOptions): Promise<CossResult<SchedulingAttendeeErasure>> {
    return this.#http.request<SchedulingAttendeeErasure>({
      method: "DELETE",
      path: `/v1/scheduling/attendees/${part(uid)}`,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling.settings`. */
export class SchedulingSettingsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().scheduling.settings`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** The environment's scheduling settings. */
  get(options?: ReadOptions): Promise<CossResult<SchedulingSettings>> {
    return this.#http.request<SchedulingSettings>({
      method: "GET",
      path: "/v1/scheduling/settings",
      signal: options?.signal,
    });
  }

  /** Changes what's given. */
  update(
    params: UpdateSchedulingSettingsParams,
    options?: ReadOptions,
  ): Promise<CossResult<SchedulingSettings>> {
    return this.#http.request<SchedulingSettings>({
      method: "PATCH",
      path: "/v1/scheduling/settings",
      body: params,
      signal: options?.signal,
    });
  }
}

/** `coss.scheduling`: availability and bookings. */
export class SchedulingResource {
  readonly hosts: SchedulingHostsResource;
  readonly schedules: SchedulingSchedulesResource;
  readonly eventTypes: SchedulingEventTypesResource;
  readonly slots: SchedulingSlotsResource;
  readonly availability: SchedulingAvailabilityResource;
  readonly bookings: SchedulingBookingsResource;
  readonly holds: SchedulingHoldsResource;
  readonly series: SchedulingSeriesResource;
  readonly calendars: SchedulingCalendarsResource;
  readonly sessions: SchedulingSessionsResource;
  readonly attendees: SchedulingAttendeesResource;
  readonly settings: SchedulingSettingsResource;

  /** @internal Use `new Coss().scheduling`. */
  constructor(http: HttpClient) {
    this.hosts = new SchedulingHostsResource(http);
    this.schedules = new SchedulingSchedulesResource(http);
    this.eventTypes = new SchedulingEventTypesResource(http);
    this.slots = new SchedulingSlotsResource(http);
    this.availability = new SchedulingAvailabilityResource(http);
    this.bookings = new SchedulingBookingsResource(http);
    this.holds = new SchedulingHoldsResource(http);
    this.series = new SchedulingSeriesResource(http);
    this.calendars = new SchedulingCalendarsResource(http);
    this.sessions = new SchedulingSessionsResource(http);
    this.attendees = new SchedulingAttendeesResource(http);
    this.settings = new SchedulingSettingsResource(http);
  }
}
