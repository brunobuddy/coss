# frozen_string_literal: true

module Coss
  module Scheduling
    module Holds
      module Types
        class CreateHoldRequestLocationPhone < Internal::Types::Model
          field :number, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
