# frozen_string_literal: true

module Coss
  module Scheduling
    module EventTypes
      module Types
        class UpdateEventTypeRequestNotificationsValue < Internal::Types::Model
          field :email_attendee, -> { Internal::Types::Boolean }, optional: true, nullable: false

          field :email_host, -> { Internal::Types::Boolean }, optional: true, nullable: false

          field :sms_attendee, -> { Internal::Types::Boolean }, optional: true, nullable: false
        end
      end
    end
  end
end
