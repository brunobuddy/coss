# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        class CancelSchedulingBookingRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false

          field :reason, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
