# frozen_string_literal: true

module Coss
  module Types
    # Who did it.
    class SchedulingBookingEventActor < Internal::Types::Model
      field :kind, -> { Coss::Types::SchedulingBookingEventActorKind }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: true
    end
  end
end
