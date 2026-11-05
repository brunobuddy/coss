# frozen_string_literal: true

module Coss
  module Types
    class SchedulingReminderInput < Internal::Types::Model
      field :key, -> { String }, optional: true, nullable: false

      field :anchor, -> { Coss::Types::SchedulingReminderInputAnchor }, optional: false, nullable: false

      field :before_minutes, -> { Integer }, optional: true, nullable: false

      field :after_minutes, -> { Integer }, optional: true, nullable: false

      field :send_, -> { Internal::Types::Array[Coss::Types::SchedulingReminderInputSendItem] }, optional: true, nullable: false, api_name: "send"

      field :email_to, -> { Internal::Types::Array[String] }, optional: true, nullable: false

      field :subject, -> { String }, optional: true, nullable: false

      field :message, -> { String }, optional: true, nullable: false

      field :sms_message, -> { String }, optional: true, nullable: false

      field :button, -> { Coss::Types::SchedulingReminderInputButton }, optional: true, nullable: false

      field :include_invite, -> { Internal::Types::Boolean }, optional: true, nullable: false

      field :send_if_late, -> { Internal::Types::Boolean }, optional: true, nullable: false

      field :skip_no_show, -> { Internal::Types::Boolean }, optional: true, nullable: false

      field :only_if, -> { Coss::Types::SchedulingReminderInputOnlyIf }, optional: true, nullable: false
    end
  end
end
