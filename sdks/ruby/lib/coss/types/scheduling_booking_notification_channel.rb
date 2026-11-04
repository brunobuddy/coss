# frozen_string_literal: true

module Coss
  module Types
    module SchedulingBookingNotificationChannel
      extend Coss::Internal::Types::Enum

      EMAIL = "email"
      SMS = "sms"
      WEBHOOK = "webhook"
    end
  end
end
