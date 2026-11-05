# frozen_string_literal: true

module Coss
  module Types
    class SchedulingAttendeeErasureByEmail < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingAttendeeErasureByEmailObject }, optional: false, nullable: false

      field :erased, -> { Integer }, optional: false, nullable: false
    end
  end
end
