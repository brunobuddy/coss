# frozen_string_literal: true

module Coss
  module Types
    # Only for bookings matching all of this, checked when it's due.
    class SchedulingReminderInputOnlyIf < Internal::Types::Model
      field :metadata, -> { Internal::Types::Hash[String, String] }, optional: true, nullable: false

      field :location_types, -> { Internal::Types::Array[Coss::Types::SchedulingReminderInputOnlyIfLocationTypesItem] }, optional: true, nullable: false
    end
  end
end
