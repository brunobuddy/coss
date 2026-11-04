# frozen_string_literal: true

module Coss
  module Types
    class SchedulingEventTypeList < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingEventTypeListObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingEventType] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
