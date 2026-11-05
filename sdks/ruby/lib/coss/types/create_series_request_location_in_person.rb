# frozen_string_literal: true

module Coss
  module Types
    class CreateSeriesRequestLocationInPerson < Internal::Types::Model
      field :address, -> { String }, optional: true, nullable: false
    end
  end
end
