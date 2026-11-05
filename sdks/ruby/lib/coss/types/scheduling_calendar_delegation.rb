# frozen_string_literal: true

module Coss
  module Types
    class SchedulingCalendarDelegation < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingCalendarDelegationObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :provider, -> { Coss::Types::SchedulingCalendarDelegationProvider }, optional: false, nullable: false

      field :domain, -> { String }, optional: false, nullable: false

      field :status, -> { Coss::Types::SchedulingCalendarDelegationStatus }, optional: false, nullable: false

      field :match_host_email, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :client_id, -> { String }, optional: false, nullable: false

      field :tenant_id, -> { String }, optional: false, nullable: true

      field :scopes, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :verified_account, -> { String }, optional: false, nullable: true

      field :last_error_code, -> { String }, optional: false, nullable: true

      field :failing_since, -> { String }, optional: false, nullable: true

      field :secret_expires_at, -> { String }, optional: false, nullable: true

      field :hosts_connected, -> { Integer }, optional: false, nullable: false

      field :hosts_failed, -> { Integer }, optional: false, nullable: false

      field :created_at, -> { String }, optional: false, nullable: false

      field :updated_at, -> { String }, optional: false, nullable: false
    end
  end
end
