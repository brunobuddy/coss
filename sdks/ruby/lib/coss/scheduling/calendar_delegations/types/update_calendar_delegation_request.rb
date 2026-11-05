# frozen_string_literal: true

module Coss
  module Scheduling
    module CalendarDelegations
      module Types
        class UpdateCalendarDelegationRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false

          field :match_host_email, -> { Internal::Types::Boolean }, optional: true, nullable: false

          field :service_account_key, -> { String }, optional: true, nullable: false

          field :client_secret, -> { String }, optional: true, nullable: false

          field :secret_expires_at, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
