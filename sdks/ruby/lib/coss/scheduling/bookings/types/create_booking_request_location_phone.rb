# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        class CreateBookingRequestLocationPhone < Internal::Types::Model
          field :number, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
