# frozen_string_literal: true

module Coss
  module Types
    class CreateCalendarDelegationRequestMicrosoft < Internal::Types::Model
      field :domain, -> { String }, optional: false, nullable: false

      field :match_host_email, -> { Internal::Types::Boolean }, optional: true, nullable: false

      field :tenant_id, -> { String }, optional: false, nullable: false

      field :client_id, -> { String }, optional: false, nullable: false

      field :client_secret, -> { String }, optional: false, nullable: false

      field :secret_expires_at, -> { String }, optional: true, nullable: false
    end
  end
end
