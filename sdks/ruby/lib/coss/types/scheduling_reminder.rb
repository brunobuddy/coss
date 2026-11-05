# frozen_string_literal: true

module Coss
  module Types
    class SchedulingReminder < Internal::Types::Model
      field :key, -> { String }, optional: false, nullable: false

      field :anchor, -> { Coss::Types::SchedulingReminderAnchor }, optional: false, nullable: false

      field :before_minutes, -> { Integer }, optional: false, nullable: true

      field :after_minutes, -> { Integer }, optional: false, nullable: true

      field :send_, -> { Internal::Types::Array[Coss::Types::SchedulingReminderSendItem] }, optional: false, nullable: false, api_name: "send"

      field :email_to, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :subject, -> { String }, optional: false, nullable: true

      field :message, -> { String }, optional: false, nullable: true

      field :sms_message, -> { String }, optional: false, nullable: true

      field :button, -> { Coss::Types::SchedulingReminderButton }, optional: false, nullable: true

      field :include_invite, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :send_if_late, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :skip_no_show, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :only_if, -> { Coss::Types::SchedulingReminderOnlyIf }, optional: false, nullable: true
    end
  end
end
