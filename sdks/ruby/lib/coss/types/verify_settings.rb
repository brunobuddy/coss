# frozen_string_literal: true

module Coss
  module Types
    # An environment's Verify settings.
    class VerifySettings < Internal::Types::Model
      field :object, -> { Coss::Types::VerifySettingsObject }, optional: false, nullable: false

      field :app_name, -> { String }, optional: false, nullable: false

      field :app_name_is_default, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :code_length, -> { Integer }, optional: false, nullable: false

      field :ttl_seconds, -> { Integer }, optional: false, nullable: false

      field :max_attempts, -> { Integer }, optional: false, nullable: false

      field :sms_from, -> { String }, optional: false, nullable: true

      field :email_from, -> { String }, optional: false, nullable: true

      field :allowed_countries, -> { Internal::Types::Array[String] }, optional: false, nullable: false
    end
  end
end
