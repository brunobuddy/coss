# frozen_string_literal: true

module Coss
  module Types
    # A cap on bookings in a day or a week.
    class SchedulingLimit < Internal::Types::Model
      field :period, -> { Coss::Types::SchedulingLimitPeriod }, optional: false, nullable: false

      field :max, -> { Integer }, optional: false, nullable: false

      field :scope, -> { Coss::Types::SchedulingLimitScope }, optional: true, nullable: false
    end
  end
end
