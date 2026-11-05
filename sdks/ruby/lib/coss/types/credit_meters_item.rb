# frozen_string_literal: true

module Coss
  module Types
    module CreditMetersItem
      extend Coss::Internal::Types::Enum

      EMAIL_RECIPIENTS = "email.recipients"
      EMAIL_DEDICATED_IP = "email.dedicated_ip"
      EMAIL_ATTACHMENT_DATA = "email.attachment_data"
      EMAIL_RECEIVED = "email.received"
      EMAIL_RECEIVED_DATA = "email.received_data"
      EMAIL_INBOXES = "email.inboxes"
      SMS_SEGMENTS = "sms.segments"
      SMS_RECEIVED_SEGMENTS = "sms.received_segments"
      SMS_NUMBERS = "sms.numbers"
      SMS_REGISTRATIONS = "sms.registrations"
      SIGN_COMPLETED_REQUESTS = "sign.completed_requests"
      RISK_PHONE_CHECKS = "risk.phone_checks"
      RISK_ASSESSMENTS = "risk.assessments"
      RISK_CONTENT_CHECKS = "risk.content_checks"
      VERIFY_VERIFICATIONS = "verify.verifications"
      VERIFY_SMS = "verify.sms"
      FORMS_SUBMISSIONS = "forms.submissions"
      FORMS_FILE_UPLOADS = "forms.file_uploads"
      SCHEDULING_BOOKINGS = "scheduling.bookings"
      SCHEDULING_HOSTS = "scheduling.hosts"
      HOOKS_MESSAGES = "hooks.messages"
    end
  end
end
