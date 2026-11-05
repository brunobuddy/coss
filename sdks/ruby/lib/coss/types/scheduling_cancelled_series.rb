# frozen_string_literal: true

module Coss
  module Types
    class SchedulingCancelledSeries < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingCancelledSeriesObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingBooking] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
