# frozen_string_literal: true

module Coss
  module Types
    # Only for bookings matching all of this. `null`: every booking.
    class SchedulingReminderOnlyIf < Internal::Types::Model
      field :metadata, -> { Internal::Types::Hash[String, String] }, optional: false, nullable: true

      field :location_types, -> { Internal::Types::Array[String] }, optional: false, nullable: true
    end
  end
end
