# frozen_string_literal: true

module Coss
  module Scheduling
    module Holds
      module Types
        class ConfirmHoldRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false

          field :if_still_free, -> { Internal::Types::Boolean }, optional: true, nullable: false
        end
      end
    end
  end
end
