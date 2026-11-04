# frozen_string_literal: true

module Coss
  module Types
    module SchedulingReminderAnchor
      extend Coss::Internal::Types::Enum

      START = "start"
      END_ = "end"
      CONFIRMED = "confirmed"
      RESCHEDULED = "rescheduled"
      CANCELLED = "cancelled"
      DECLINED = "declined"
      PENDING_APPROVAL = "pending_approval"
      NO_SHOW = "no_show"
    end
  end
end
