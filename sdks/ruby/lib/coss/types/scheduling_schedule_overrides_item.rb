# frozen_string_literal: true

module Coss
  module Types
    class SchedulingScheduleOverridesItem < Internal::Types::Model
      field :date, -> { String }, optional: false, nullable: false

      field :ranges, -> { Internal::Types::Array[Coss::Types::SchedulingScheduleOverridesItemRangesItem] }, optional: false, nullable: false
    end
  end
end
