# frozen_string_literal: true

module Coss
  module Types
    module SchedulingBookingWebhookEventType
      extend Coss::Internal::Types::Enum

      SCHEDULING_BOOKING_CREATED = "scheduling.booking.created"
      SCHEDULING_BOOKING_PENDING_APPROVAL = "scheduling.booking.pending_approval"
      SCHEDULING_BOOKING_CONFIRMED = "scheduling.booking.confirmed"
      SCHEDULING_BOOKING_RESCHEDULED = "scheduling.booking.rescheduled"
      SCHEDULING_BOOKING_CANCELLED = "scheduling.booking.cancelled"
      SCHEDULING_BOOKING_DECLINED = "scheduling.booking.declined"
      SCHEDULING_BOOKING_NO_SHOW = "scheduling.booking.no_show"
      SCHEDULING_BOOKING_EXTERNAL_CONFLICT = "scheduling.booking.external_conflict"
      SCHEDULING_BOOKING_CALENDAR_WRITE_FAILED = "scheduling.booking.calendar_write_failed"
      SCHEDULING_BOOKING_LOCATION_READY = "scheduling.booking.location_ready"
      SCHEDULING_BOOKING_STARTED = "scheduling.booking.started"
      SCHEDULING_BOOKING_ENDED = "scheduling.booking.ended"
      SCHEDULING_BOOKING_REMINDER = "scheduling.booking.reminder"
    end
  end
end
