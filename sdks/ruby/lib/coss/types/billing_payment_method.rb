# frozen_string_literal: true

module Coss
  module Types
    # The payment method on file. `null`: none.
    class BillingPaymentMethod < Internal::Types::Model
      field :type, -> { String }, optional: false, nullable: false

      field :brand, -> { String }, optional: false, nullable: true

      field :last4, -> { String }, optional: false, nullable: true
    end
  end
end
