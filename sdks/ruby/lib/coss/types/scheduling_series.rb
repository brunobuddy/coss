# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSeries < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingSeriesObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :bookings, -> { Internal::Types::Array[Coss::Types::SchedulingBooking] }, optional: false, nullable: false

      field :conflicts, -> { Internal::Types::Array[Coss::Types::SchedulingSeriesConflictsItem] }, optional: false, nullable: false
    end
  end
end
