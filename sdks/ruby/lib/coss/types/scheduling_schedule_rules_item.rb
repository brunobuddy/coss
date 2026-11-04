# frozen_string_literal: true

module Coss
  module Types
    class SchedulingScheduleRulesItem < Internal::Types::Model
      field :days, -> { Internal::Types::Array[Integer] }, optional: false, nullable: false

      field :start, -> { String }, optional: false, nullable: false

      field :end_, -> { String }, optional: false, nullable: false, api_name: "end"
    end
  end
end
