# frozen_string_literal: true

module Coss
  module Types
    module BillingHoldsItemReason
      extend Coss::Internal::Types::Enum

      DELINQUENT = "delinquent"
      SPEND_LIMIT = "spend_limit"
      CREDIT_LIMIT = "credit_limit"
      ADMIN = "admin"
    end
  end
end
