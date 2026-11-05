# frozen_string_literal: true

module Coss
  module Types
    module SchedulingReminderSendItem
      extend Coss::Internal::Types::Enum

      EMAIL_ATTENDEE = "email_attendee"
      EMAIL_HOST = "email_host"
      SMS_ATTENDEE = "sms_attendee"
      SMS_HOST = "sms_host"
      WEBHOOK = "webhook"
    end
  end
end
