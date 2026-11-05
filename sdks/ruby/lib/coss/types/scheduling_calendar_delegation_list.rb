# frozen_string_literal: true

module Coss
  module Types
    class SchedulingCalendarDelegationList < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingCalendarDelegationListObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingCalendarDelegation] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
