# frozen_string_literal: true

module Coss
  module Types
    class SchedulingHostList < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingHostListObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingHost] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
