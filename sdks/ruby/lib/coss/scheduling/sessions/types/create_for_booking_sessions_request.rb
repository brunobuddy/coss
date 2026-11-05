# frozen_string_literal: true

module Coss
  module Scheduling
    module Sessions
      module Types
        class CreateForBookingSessionsRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
