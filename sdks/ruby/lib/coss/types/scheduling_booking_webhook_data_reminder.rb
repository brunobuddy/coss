# frozen_string_literal: true

module Coss
  module Types
    # `scheduling.booking.reminder`: which reminder this is.
    class SchedulingBookingWebhookDataReminder < Internal::Types::Model
      field :key, -> { String }, optional: false, nullable: false

      field :anchor, -> { Coss::Types::SchedulingBookingWebhookDataReminderAnchor }, optional: false, nullable: false

      field :before_minutes, -> { Integer }, optional: false, nullable: true

      field :after_minutes, -> { Integer }, optional: false, nullable: true

      field :scheduled_for, -> { String }, optional: false, nullable: false
    end
  end
end
