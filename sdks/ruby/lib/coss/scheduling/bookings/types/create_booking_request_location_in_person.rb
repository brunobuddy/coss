# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        class CreateBookingRequestLocationInPerson < Internal::Types::Model
          field :address, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
