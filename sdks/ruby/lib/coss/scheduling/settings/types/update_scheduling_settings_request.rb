# frozen_string_literal: true

module Coss
  module Scheduling
    module Settings
      module Types
        class UpdateSchedulingSettingsRequest < Internal::Types::Model
          field :allowed_origins, -> { Internal::Types::Array[String] }, optional: true, nullable: false

          field :brand_name, -> { String }, optional: true, nullable: false

          field :accent_color, -> { String }, optional: true, nullable: false

          field :logo, -> { Coss::Scheduling::Settings::Types::UpdateSchedulingSettingsRequestLogo }, optional: true, nullable: false

          field :email_from, -> { String }, optional: true, nullable: false

          field :sms_from, -> { String }, optional: true, nullable: false

          field :calendar_failure_mode, -> { Coss::Scheduling::Settings::Types::UpdateSchedulingSettingsRequestCalendarFailureMode }, optional: true, nullable: false

          field :notifications, -> { Internal::Types::Hash[String, Coss::Scheduling::Settings::Types::UpdateSchedulingSettingsRequestNotificationsValue] }, optional: true, nullable: false

          field :email_reply_to, -> { String }, optional: true, nullable: false

          field :reminders, -> { Internal::Types::Array[Coss::Types::SchedulingReminderInput] }, optional: true, nullable: false
        end
      end
    end
  end
end
