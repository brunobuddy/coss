# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        class NotificationsBookingsRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false

          field :limit, -> { Integer }, optional: true, nullable: false

          field :after, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
