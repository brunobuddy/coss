# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        module ListBookingsRequestStatus
          extend Coss::Internal::Types::Enum

          HELD = "held"
          PENDING_APPROVAL = "pending_approval"
          CONFIRMED = "confirmed"
          CANCELLED = "cancelled"
          DECLINED = "declined"
        end
      end
    end
  end
end
