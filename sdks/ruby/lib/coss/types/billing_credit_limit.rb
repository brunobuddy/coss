# frozen_string_literal: true

module Coss
  module Types
    # Where the organization stands against its credit limit; `null`: it has none.
    class BillingCreditLimit < Internal::Types::Model
      field :limit, -> { Integer }, optional: false, nullable: false

      field :used, -> { Integer }, optional: false, nullable: false

      field :charge_threshold, -> { Integer }, optional: false, nullable: true
    end
  end
end
