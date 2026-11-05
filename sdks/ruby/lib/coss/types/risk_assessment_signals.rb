# frozen_string_literal: true

module Coss
  module Types
    # What the assessment saw, by group. A group is `null` when it had nothing to go on.
    class RiskAssessmentSignals < Internal::Types::Model
      field :email, -> { Coss::Types::RiskEmailSignals }, optional: false, nullable: true

      field :ip, -> { Coss::Types::RiskIPSignals }, optional: false, nullable: true

      field :velocity, -> { Internal::Types::Hash[String, Integer] }, optional: false, nullable: true

      field :captcha, -> { Coss::Types::RiskCaptchaSignals }, optional: false, nullable: true

      field :login, -> { Coss::Types::RiskLoginSignals }, optional: false, nullable: true

      field :content, -> { Coss::Types::RiskContentSignals }, optional: false, nullable: true

      field :checkout, -> { Coss::Types::RiskCheckoutSignals }, optional: false, nullable: true

      field :device, -> { Coss::Types::RiskDeviceSignals }, optional: false, nullable: true
    end
  end
end
