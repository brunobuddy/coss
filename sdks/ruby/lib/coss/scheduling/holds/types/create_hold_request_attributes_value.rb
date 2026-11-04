# frozen_string_literal: true

module Coss
  module Scheduling
    module Holds
      module Types
        class CreateHoldRequestAttributesValue < Internal::Types::Model
          extend Coss::Internal::Types::Union

          member -> { String }

          member -> { Internal::Types::Array[String] }
        end
      end
    end
  end
end
