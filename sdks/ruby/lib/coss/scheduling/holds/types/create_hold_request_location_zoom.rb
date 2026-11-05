# frozen_string_literal: true

module Coss
  module Scheduling
    module Holds
      module Types
        class CreateHoldRequestLocationZoom < Internal::Types::Model
          field :url, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
