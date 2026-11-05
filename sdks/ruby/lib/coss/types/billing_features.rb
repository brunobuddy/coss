# frozen_string_literal: true

module Coss
  module Types
    # Which features the plan includes.
    class BillingFeatures < Internal::Types::Model
      field :tracking_domains, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :audit_log, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :log_drains, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :sso, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :scim, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :dedicated_ips, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
