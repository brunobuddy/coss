# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        class RescheduleBookingRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false

          field :start, -> { String }, optional: false, nullable: false

          field :host, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
