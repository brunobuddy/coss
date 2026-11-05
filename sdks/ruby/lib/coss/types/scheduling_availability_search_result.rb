# frozen_string_literal: true

module Coss
  module Types
    class SchedulingAvailabilitySearchResult < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingAvailabilitySearchResultObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingAvailabilitySearchResultDataItem] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
