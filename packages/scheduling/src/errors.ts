export type SchedulingErrorCode =
  | "not_found"
  | "invalid_time_zone"
  | "invalid_schedule"
  | "invalid_event_type"
  | "invalid_attendee"
  | "invalid_answers"
  | "invalid_time"
  | "invalid_logo"
  | "invalid_out_of_office"
  | "invalid_reassignment"
  | "no_reassign_candidate"
  | "reassign_target_unavailable"
  | "reassignment_not_finished"
  | "invalid_session"
  | "invalid_holiday_calendar"
  | "uid_taken"
  | "slot_unavailable"
  | "booking_not_changeable"
  | "notice_too_short"
  | "hold_expired"
  | "host_has_live_bookings"
  | "attendee_data_erased"
  | "content_refused"
  | "calendar_unavailable"
  | "scheduling_unavailable"
  | "account_suspended"
  | "idempotency_in_progress"
  | "idempotency_key_reused";

// Refusals are never 409: the SDK retries those, and a lost slot stays lost.
const STATUS_BY_CODE = {
  not_found: 404,
  invalid_time_zone: 422,
  invalid_schedule: 422,
  invalid_event_type: 422,
  invalid_attendee: 422,
  invalid_answers: 422,
  invalid_time: 422,
  invalid_logo: 422,
  invalid_out_of_office: 422,
  invalid_reassignment: 422,
  no_reassign_candidate: 422,
  reassign_target_unavailable: 422,
  reassignment_not_finished: 422,
  invalid_session: 422,
  invalid_holiday_calendar: 422,
  uid_taken: 422,
  slot_unavailable: 422,
  booking_not_changeable: 422,
  notice_too_short: 422,
  hold_expired: 422,
  host_has_live_bookings: 422,
  attendee_data_erased: 422,
  content_refused: 422,
  calendar_unavailable: 422,
  scheduling_unavailable: 503,
  account_suspended: 403,
  idempotency_in_progress: 409,
  idempotency_key_reused: 422,
} as const satisfies Record<SchedulingErrorCode, number>;

/** Expected failures of the Scheduling product; `status` is the HTTP status the API should use. */
export class SchedulingError extends Error {
  readonly code: SchedulingErrorCode;
  readonly param: string | undefined;

  constructor(code: SchedulingErrorCode, message: string, opts?: { param?: string }) {
    super(message);
    this.name = "SchedulingError";
    this.code = code;
    this.param = opts?.param;
  }

  get status(): (typeof STATUS_BY_CODE)[SchedulingErrorCode] {
    return STATUS_BY_CODE[this.code];
  }
}
