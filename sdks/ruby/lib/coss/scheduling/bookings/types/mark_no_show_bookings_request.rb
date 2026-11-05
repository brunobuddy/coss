# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        class MarkNoShowBookingsRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
