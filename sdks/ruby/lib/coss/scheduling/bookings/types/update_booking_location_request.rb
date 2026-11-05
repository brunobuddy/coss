# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        class UpdateBookingLocationRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false

          field :location, -> { Coss::Types::SchedulingLocation }, optional: false, nullable: false
        end
      end
    end
  end
end
