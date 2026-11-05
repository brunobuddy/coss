# frozen_string_literal: true

module Coss
  module Types
    module CreditSource
      extend Coss::Internal::Types::Enum

      FEE = "fee"
      COMMITMENT = "commitment"
      SUPPORT = "support"
      PROMOTION = "promotion"
      REFUND = "refund"
      SLA = "sla"
      THRESHOLD = "threshold"
    end
  end
end
