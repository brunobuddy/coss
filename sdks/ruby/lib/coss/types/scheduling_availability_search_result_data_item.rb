# frozen_string_literal: true

module Coss
  module Types
    class SchedulingAvailabilitySearchResultDataItem < Internal::Types::Model
      field :host, -> { String }, optional: false, nullable: false

      field :uid, -> { String }, optional: false, nullable: true

      field :slots, -> { Internal::Types::Array[Coss::Types::SchedulingAvailabilitySearchResultDataItemSlotsItem] }, optional: false, nullable: false
    end
  end
end
