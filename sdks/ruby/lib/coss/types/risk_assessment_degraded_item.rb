# frozen_string_literal: true

module Coss
  module Types
    module RiskAssessmentDegradedItem
      extend Coss::Internal::Types::Enum

      EMAIL_DNS = "email_dns"
      DOMAIN_AGE = "domain_age"
      IP_DATA = "ip_data"
      VELOCITY = "velocity"
      CAPTCHA = "captcha"
      CONTENT = "content"
      IP_PRIVACY = "ip_privacy"
      USAGE_LIMIT = "usage_limit"
    end
  end
end
