# frozen_string_literal: true

module Coss
  module Types
    class SchedulingScheduleList < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingScheduleListObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingSchedule] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
