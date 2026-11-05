# frozen_string_literal: true

module Coss
  module Types
    class UpsertScheduleRequest < Internal::Types::Model
      field :name, -> { String }, optional: true, nullable: false

      field :time_zone, -> { String }, optional: true, nullable: false

      field :is_default, -> { Internal::Types::Boolean }, optional: true, nullable: false

      field :rules, -> { Internal::Types::Array[Coss::Types::SchedulingWeeklyRule] }, optional: false, nullable: false

      field :overrides, -> { Internal::Types::Array[Coss::Types::SchedulingScheduleOverride] }, optional: true, nullable: false
    end
  end
end
