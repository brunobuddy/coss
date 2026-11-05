# frozen_string_literal: true

module Coss
  module Types
    # How far ahead a slot can be booked: `rolling` for a number of days from now, or `range` for fixed dates. On an
    # event type, `null` means no window of its own.
    class SchedulingBookingWindow < Internal::Types::Model
      extend Coss::Internal::Types::Union

      member -> { Coss::Types::SchedulingBookingWindowDays }

      member -> { Coss::Types::SchedulingBookingWindowFrom }
    end
  end
end
