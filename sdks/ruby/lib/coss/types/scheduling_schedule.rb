# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSchedule < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingScheduleObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :host, -> { String }, optional: false, nullable: false

      field :name, -> { String }, optional: false, nullable: false

      field :time_zone, -> { String }, optional: false, nullable: false

      field :is_default, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :rules, -> { Internal::Types::Array[Coss::Types::SchedulingScheduleRulesItem] }, optional: false, nullable: false

      field :overrides, -> { Internal::Types::Array[Coss::Types::SchedulingScheduleOverridesItem] }, optional: false, nullable: false

      field :created_at, -> { String }, optional: false, nullable: false

      field :updated_at, -> { String }, optional: false, nullable: false
    end
  end
end
