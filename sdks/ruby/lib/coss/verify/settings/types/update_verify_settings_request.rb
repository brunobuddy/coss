# frozen_string_literal: true

module Coss
  module Verify
    module Settings
      module Types
        class UpdateVerifySettingsRequest < Internal::Types::Model
          field :app_name, -> { String }, optional: true, nullable: false

          field :code_length, -> { Integer }, optional: true, nullable: false

          field :ttl_seconds, -> { Integer }, optional: true, nullable: false

          field :max_attempts, -> { Integer }, optional: true, nullable: false

          field :sms_from, -> { String }, optional: true, nullable: false

          field :email_from, -> { String }, optional: true, nullable: false

          field :allowed_countries, -> { Internal::Types::Array[String] }, optional: true, nullable: false
        end
      end
    end
  end
end
