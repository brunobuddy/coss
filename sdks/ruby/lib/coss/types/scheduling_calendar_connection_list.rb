# frozen_string_literal: true

module Coss
  module Types
    class SchedulingCalendarConnectionList < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingCalendarConnectionListObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingCalendarConnection] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
