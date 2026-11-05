# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        class CreateBookingRequestLocationLink < Internal::Types::Model
          field :url, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
