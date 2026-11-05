# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSeriesConflictsItem < Internal::Types::Model
      field :index, -> { Integer }, optional: false, nullable: false

      field :start, -> { String }, optional: false, nullable: false
    end
  end
end
