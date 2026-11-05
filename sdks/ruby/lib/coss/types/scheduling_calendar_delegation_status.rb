# frozen_string_literal: true

module Coss
  module Types
    module SchedulingCalendarDelegationStatus
      extend Coss::Internal::Types::Enum

      PENDING = "pending"
      ACTIVE = "active"
      FAILING = "failing"
      DELETING = "deleting"
    end
  end
end
