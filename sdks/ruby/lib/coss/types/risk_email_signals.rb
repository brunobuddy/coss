# frozen_string_literal: true

module Coss
  module Types
    # What the address says. `null` on an assessment with no email.
    class RiskEmailSignals < Internal::Types::Model
      field :domain, -> { String }, optional: false, nullable: true

      field :valid, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :disposable, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :deliverability, -> { Coss::Types::RiskEmailSignalsDeliverability }, optional: false, nullable: false

      field :role_account, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :free_provider, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :suggestion, -> { String }, optional: false, nullable: true

      field :domain_age_days, -> { Integer }, optional: false, nullable: true
    end
  end
end
