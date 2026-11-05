# frozen_string_literal: true

module Coss
  module Types
    class SchedulingBookingNotification < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingBookingNotificationObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :kind, -> { String }, optional: false, nullable: false

      field :reminder_key, -> { String }, optional: false, nullable: true

      field :channel, -> { Coss::Types::SchedulingBookingNotificationChannel }, optional: false, nullable: false

      field :recipient, -> { Coss::Types::SchedulingBookingNotificationRecipient }, optional: false, nullable: false

      field :due_at, -> { String }, optional: false, nullable: false

      field :finished_at, -> { String }, optional: false, nullable: true

      field :outcome, -> { String }, optional: false, nullable: true
    end
  end
end
