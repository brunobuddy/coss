# frozen_string_literal: true

module Coss
  module Scheduling
    module Holds
      module Types
        class CreateHoldRequestLocationInPerson < Internal::Types::Model
          field :address, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
