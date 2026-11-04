# frozen_string_literal: true

module Coss
  module Types
    class Billing < Internal::Types::Model
      field :object, -> { Coss::Types::BillingObject }, optional: false, nullable: false

      field :organization_id, -> { String }, optional: false, nullable: false

      field :plan, -> { Coss::Types::BillingPlan }, optional: false, nullable: false

      field :contract, -> { Coss::Types::BillingContract }, optional: false, nullable: true

      field :scheduled_change, -> { Coss::Types::BillingScheduledChange }, optional: false, nullable: true

      field :status, -> { Coss::Types::BillingStatus }, optional: false, nullable: false

      field :holds, -> { Internal::Types::Array[Coss::Types::BillingHoldsItem] }, optional: false, nullable: false

      field :currency, -> { Coss::Types::BillingCurrency }, optional: false, nullable: false

      field :period, -> { Coss::Types::BillingPeriod }, optional: false, nullable: false

      field :usage, -> { Internal::Types::Array[Coss::Types::BillingUsageItem] }, optional: false, nullable: false

      field :estimate, -> { Coss::Types::BillingEstimate }, optional: false, nullable: false

      field :credit_remaining, -> { Integer }, optional: false, nullable: false

      field :spend_limit, -> { Integer }, optional: false, nullable: true

      field :credit_limit, -> { Coss::Types::BillingCreditLimit }, optional: false, nullable: true

      field :payment_method, -> { Coss::Types::BillingPaymentMethod }, optional: false, nullable: true

      field :add_ons, -> { Internal::Types::Array[Coss::Types::BillingAddOnsItem] }, optional: false, nullable: false

      field :features, -> { Coss::Types::BillingFeatures }, optional: false, nullable: false

      field :limits, -> { Coss::Types::BillingLimits }, optional: false, nullable: false
    end
  end
end
