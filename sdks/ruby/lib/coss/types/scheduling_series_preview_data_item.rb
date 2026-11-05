# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSeriesPreviewDataItem < Internal::Types::Model
      field :start, -> { String }, optional: false, nullable: false

      field :available, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :reason, -> { String }, optional: false, nullable: true

      field :hosts, -> { Internal::Types::Array[String] }, optional: false, nullable: false
    end
  end
end
