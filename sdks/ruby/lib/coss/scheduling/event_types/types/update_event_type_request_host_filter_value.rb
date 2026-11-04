# frozen_string_literal: true

module Coss
  module Scheduling
    module EventTypes
      module Types
        class UpdateEventTypeRequestHostFilterValue < Internal::Types::Model
          extend Coss::Internal::Types::Union

          member -> { String }

          member -> { Internal::Types::Array[String] }
        end
      end
    end
  end
end
