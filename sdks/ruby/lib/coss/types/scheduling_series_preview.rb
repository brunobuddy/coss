# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSeriesPreview < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingSeriesPreviewObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingSeriesPreviewDataItem] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
