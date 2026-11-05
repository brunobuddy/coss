# frozen_string_literal: true

module Coss
  module Types
    class CreateCalendarDelegationRequestGoogle < Internal::Types::Model
      field :domain, -> { String }, optional: false, nullable: false

      field :match_host_email, -> { Internal::Types::Boolean }, optional: true, nullable: false

      field :service_account_key, -> { String }, optional: false, nullable: false
    end
  end
end
