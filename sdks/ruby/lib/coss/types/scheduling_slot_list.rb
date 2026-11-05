# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSlotList < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingSlotListObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingSlot] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
