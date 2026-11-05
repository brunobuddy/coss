# frozen_string_literal: true

module Coss
  module Scheduling
    module Holds
      module Types
        class CreateHoldRequestLocationLink < Internal::Types::Model
          field :url, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
