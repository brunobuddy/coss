# frozen_string_literal: true

module Coss
  module Types
    class SchedulingAttendeeErasure < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingAttendeeErasureObject }, optional: false, nullable: false

      field :uid, -> { String }, optional: false, nullable: false

      field :erased, -> { Integer }, optional: false, nullable: false
    end
  end
end
