# frozen_string_literal: true

module Coss
  module Types
    class CreateSeriesRequest < Internal::Types::Model
      field :event_type, -> { String }, optional: false, nullable: false

      field :start, -> { String }, optional: false, nullable: false

      field :host, -> { String }, optional: true, nullable: false

      field :attributes, -> { Internal::Types::Hash[String, Coss::Types::CreateSeriesRequestAttributesValue] }, optional: true, nullable: false

      field :duration_minutes, -> { Integer }, optional: true, nullable: false

      field :attendee, -> { Coss::Types::SchedulingAttendeeInput }, optional: false, nullable: false

      field :guests, -> { Internal::Types::Array[Coss::Types::SchedulingGuestInput] }, optional: true, nullable: false

      field :answers, -> { Internal::Types::Hash[String, Coss::Types::CreateSeriesRequestAnswersValue] }, optional: true, nullable: false

      field :location, -> { Coss::Types::CreateSeriesRequestLocation }, optional: true, nullable: false

      field :metadata, -> { Internal::Types::Hash[String, String] }, optional: true, nullable: false

      field :recurrence, -> { Coss::Types::CreateSeriesRequestRecurrence }, optional: false, nullable: false

      field :on_conflict, -> { Coss::Types::CreateSeriesRequestOnConflict }, optional: true, nullable: false
    end
  end
end
