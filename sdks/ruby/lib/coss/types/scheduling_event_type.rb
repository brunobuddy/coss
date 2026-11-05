# frozen_string_literal: true

module Coss
  module Types
    class SchedulingEventType < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingEventTypeObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :uid, -> { String }, optional: false, nullable: true

      field :description, -> { String }, optional: false, nullable: true

      field :title, -> { String }, optional: false, nullable: false

      field :kind, -> { Coss::Types::SchedulingEventTypeKind }, optional: false, nullable: false

      field :status, -> { Coss::Types::SchedulingEventTypeStatus }, optional: false, nullable: false

      field :duration_minutes, -> { Integer }, optional: false, nullable: false

      field :duration_options, -> { Internal::Types::Array[Integer] }, optional: false, nullable: false

      field :step_minutes, -> { Integer }, optional: false, nullable: false

      field :grid_time_zone, -> { String }, optional: false, nullable: true

      field :buffer_before_minutes, -> { Integer }, optional: false, nullable: false

      field :buffer_after_minutes, -> { Integer }, optional: false, nullable: false

      field :min_notice_minutes, -> { Integer }, optional: false, nullable: false

      field :booking_window, -> { Coss::Types::SchedulingBookingWindow }, optional: false, nullable: true

      field :limits, -> { Internal::Types::Array[Coss::Types::SchedulingLimit] }, optional: false, nullable: false

      field :capacity, -> { Integer }, optional: false, nullable: true

      field :requires_approval, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :approval_ttl_minutes, -> { Integer }, optional: false, nullable: false

      field :hold_ttl_seconds, -> { Integer }, optional: false, nullable: false

      field :cancel_notice_minutes, -> { Integer }, optional: false, nullable: false

      field :reschedule_notice_minutes, -> { Integer }, optional: false, nullable: false

      field :max_guests, -> { Integer }, optional: false, nullable: false

      field :max_active_bookings_per_attendee, -> { Integer }, optional: false, nullable: true

      field :host_calendar_details, -> { Coss::Types::SchedulingEventTypeHostCalendarDetails }, optional: false, nullable: false

      field :questions, -> { Internal::Types::Array[Coss::Types::SchedulingQuestion] }, optional: false, nullable: false

      field :locations, -> { Internal::Types::Array[Coss::Types::SchedulingLocation] }, optional: false, nullable: false

      field :host_filter, -> { Internal::Types::Hash[String, Coss::Types::SchedulingEventTypeHostFilterValue] }, optional: false, nullable: true

      field :notifications, -> { Internal::Types::Hash[String, Coss::Types::SchedulingEventTypeNotificationsValue] }, optional: false, nullable: true

      field :reminders, -> { Internal::Types::Array[Coss::Types::SchedulingReminder] }, optional: false, nullable: true

      field :hosts, -> { Internal::Types::Array[Coss::Types::SchedulingEventTypeHostsItem] }, optional: false, nullable: false

      field :metadata, -> { Internal::Types::Hash[String, String] }, optional: false, nullable: false

      field :created_at, -> { String }, optional: false, nullable: false

      field :updated_at, -> { String }, optional: false, nullable: false
    end
  end
end
