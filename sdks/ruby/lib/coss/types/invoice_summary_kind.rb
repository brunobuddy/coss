# frozen_string_literal: true

module Coss
  module Types
    module InvoiceSummaryKind
      extend Coss::Internal::Types::Enum

      PERIOD = "period"
      PLAN_CHANGE = "plan_change"
      ONE_OFF = "one_off"
      FINAL = "final"
      THRESHOLD = "threshold"
    end
  end
end
