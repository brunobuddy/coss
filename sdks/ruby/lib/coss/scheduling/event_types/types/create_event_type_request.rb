# frozen_string_literal: true

module Coss
  module Scheduling
    module EventTypes
      module Types
        class CreateEventTypeRequest < Internal::Types::Model
          field :uid, -> { String }, optional: true, nullable: false

          field :kind, -> { Coss::Scheduling::EventTypes::Types::CreateEventTypeRequestKind }, optional: true, nullable: false

          field :description, -> { String }, optional: true, nullable: false

          field :title, -> { String }, optional: false, nullable: false

          field :duration_minutes, -> { Integer }, optional: false, nullable: false

          field :duration_options, -> { Internal::Types::Array[Integer] }, optional: true, nullable: false

          field :step_minutes, -> { Integer }, optional: true, nullable: false

          field :grid_time_zone, -> { String }, optional: true, nullable: false

          field :buffer_before_minutes, -> { Integer }, optional: true, nullable: false

          field :buffer_after_minutes, -> { Integer }, optional: true, nullable: false

          field :min_notice_minutes, -> { Integer }, optional: true, nullable: false

          field :booking_window, -> { Coss::Types::SchedulingBookingWindow }, optional: true, nullable: false

          field :limits, -> { Internal::Types::Array[Coss::Types::SchedulingLimit] }, optional: true, nullable: false

          field :capacity, -> { Integer }, optional: true, nullable: false

          field :requires_approval, -> { Internal::Types::Boolean }, optional: true, nullable: false

          field :approval_ttl_minutes, -> { Integer }, optional: true, nullable: false

          field :hold_ttl_seconds, -> { Integer }, optional: true, nullable: false

          field :cancel_notice_minutes, -> { Integer }, optional: true, nullable: false

          field :reschedule_notice_minutes, -> { Integer }, optional: true, nullable: false

          field :max_guests, -> { Integer }, optional: true, nullable: false

          field :max_active_bookings_per_attendee, -> { Integer }, optional: true, nullable: false

          field :host_calendar_details, -> { Coss::Scheduling::EventTypes::Types::CreateEventTypeRequestHostCalendarDetails }, optional: true, nullable: false

          field :questions, -> { Internal::Types::Array[Coss::Types::SchedulingQuestion] }, optional: true, nullable: false

          field :locations, -> { Internal::Types::Array[Coss::Types::SchedulingLocation] }, optional: true, nullable: false

          field :host_filter, -> { Internal::Types::Hash[String, Coss::Scheduling::EventTypes::Types::CreateEventTypeRequestHostFilterValue] }, optional: true, nullable: false

          field :notifications, -> { Internal::Types::Hash[String, Coss::Scheduling::EventTypes::Types::CreateEventTypeRequestNotificationsValue] }, optional: true, nullable: false

          field :reminders, -> { Internal::Types::Array[Coss::Types::SchedulingReminderInput] }, optional: true, nullable: false

          field :metadata, -> { Internal::Types::Hash[String, String] }, optional: true, nullable: false

          field :hosts, -> { Internal::Types::Array[Coss::Types::SchedulingEventTypeHostInput] }, optional: true, nullable: false
        end
      end
    end
  end
end
