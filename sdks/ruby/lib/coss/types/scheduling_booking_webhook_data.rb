# frozen_string_literal: true

module Coss
  module Types
    # Ids, times and statuses only. Retrieve the booking for anything about the person.
    class SchedulingBookingWebhookData < Internal::Types::Model
      field :booking_id, -> { String }, optional: false, nullable: false

      field :event_type_id, -> { String }, optional: false, nullable: false

      field :status, -> { Coss::Types::SchedulingBookingWebhookDataStatus }, optional: false, nullable: false

      field :start, -> { String }, optional: false, nullable: false

      field :end_, -> { String }, optional: false, nullable: false, api_name: "end"

      field :host_ids, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :attendee_uids, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :series_id, -> { String }, optional: false, nullable: true

      field :previous_start, -> { String }, optional: true, nullable: false

      field :reminder, -> { Coss::Types::SchedulingBookingWebhookDataReminder }, optional: true, nullable: false

      field :occurred_at, -> { String }, optional: false, nullable: false
    end
  end
end
