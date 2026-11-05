# frozen_string_literal: true

module Coss
  module Scheduling
    module Holds
      module Types
        class CreateHoldRequest < Internal::Types::Model
          field :idempotency_key, -> { String }, optional: true, nullable: false, api_name: "Idempotency-Key"

          field :event_type, -> { String }, optional: false, nullable: false

          field :start, -> { String }, optional: false, nullable: false

          field :host, -> { String }, optional: true, nullable: false

          field :attributes, -> { Internal::Types::Hash[String, Coss::Scheduling::Holds::Types::CreateHoldRequestAttributesValue] }, optional: true, nullable: false

          field :duration_minutes, -> { Integer }, optional: true, nullable: false

          field :attendee, -> { Coss::Types::SchedulingAttendeeInput }, optional: false, nullable: false

          field :guests, -> { Internal::Types::Array[Coss::Types::SchedulingGuestInput] }, optional: true, nullable: false

          field :answers, -> { Internal::Types::Hash[String, Coss::Scheduling::Holds::Types::CreateHoldRequestAnswersValue] }, optional: true, nullable: false

          field :location, -> { Coss::Scheduling::Holds::Types::CreateHoldRequestLocation }, optional: true, nullable: false

          field :metadata, -> { Internal::Types::Hash[String, String] }, optional: true, nullable: false
        end
      end
    end
  end
end
