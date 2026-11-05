# frozen_string_literal: true

module Coss
  module Types
    class SchedulingBookingWindowDays < Internal::Types::Model
      field :kind, -> { Coss::Types::SchedulingBookingWindowDaysKind }, optional: false, nullable: false

      field :days, -> { Integer }, optional: false, nullable: false
    end
  end
end
