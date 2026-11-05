# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        class CreateBookingRequest < Internal::Types::Model
          field :idempotency_key, -> { String }, optional: true, nullable: false, api_name: "Idempotency-Key"

          field :event_type, -> { String }, optional: false, nullable: false

          field :start, -> { String }, optional: false, nullable: false

          field :host, -> { String }, optional: true, nullable: false

          field :attributes, -> { Internal::Types::Hash[String, Coss::Scheduling::Bookings::Types::CreateBookingRequestAttributesValue] }, optional: true, nullable: false

          field :duration_minutes, -> { Integer }, optional: true, nullable: false

          field :attendee, -> { Coss::Types::SchedulingAttendeeInput }, optional: false, nullable: false

          field :guests, -> { Internal::Types::Array[Coss::Types::SchedulingGuestInput] }, optional: true, nullable: false

          field :answers, -> { Internal::Types::Hash[String, Coss::Scheduling::Bookings::Types::CreateBookingRequestAnswersValue] }, optional: true, nullable: false

          field :location, -> { Coss::Scheduling::Bookings::Types::CreateBookingRequestLocation }, optional: true, nullable: false

          field :metadata, -> { Internal::Types::Hash[String, String] }, optional: true, nullable: false
        end
      end
    end
  end
end
