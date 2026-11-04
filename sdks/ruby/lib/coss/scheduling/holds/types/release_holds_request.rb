# frozen_string_literal: true

module Coss
  module Scheduling
    module Holds
      module Types
        class ReleaseHoldsRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
