# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSettings < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingSettingsObject }, optional: false, nullable: false

      field :allowed_origins, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :brand_name, -> { String }, optional: false, nullable: true

      field :accent_color, -> { String }, optional: false, nullable: true

      field :logo, -> { Coss::Types::SchedulingSettingsLogo }, optional: false, nullable: true

      field :email_from, -> { String }, optional: false, nullable: true

      field :sms_from, -> { String }, optional: false, nullable: true

      field :calendar_failure_mode, -> { Coss::Types::SchedulingSettingsCalendarFailureMode }, optional: false, nullable: false

      field :notifications, -> { Internal::Types::Hash[String, Coss::Types::SchedulingSettingsNotificationsValue] }, optional: false, nullable: true

      field :email_reply_to, -> { String }, optional: false, nullable: true

      field :reminders, -> { Internal::Types::Array[Coss::Types::SchedulingReminder] }, optional: false, nullable: true
    end
  end
end
