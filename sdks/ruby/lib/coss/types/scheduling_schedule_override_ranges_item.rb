# frozen_string_literal: true

module Coss
  module Types
    class SchedulingScheduleOverrideRangesItem < Internal::Types::Model
      field :start, -> { String }, optional: false, nullable: false

      field :end_, -> { String }, optional: false, nullable: false, api_name: "end"
    end
  end
end
