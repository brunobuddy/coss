# frozen_string_literal: true

module Coss
  module Types
    class SchedulingBookingEventList < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingBookingEventListObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingBookingEvent] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
