# frozen_string_literal: true

module Coss
  module Types
    class SchedulingBooking < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingBookingObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :event_type, -> { String }, optional: false, nullable: false

      field :status, -> { Coss::Types::SchedulingBookingStatus }, optional: false, nullable: false

      field :title, -> { String }, optional: false, nullable: false

      field :start, -> { String }, optional: false, nullable: false

      field :end_, -> { String }, optional: false, nullable: false, api_name: "end"

      field :hosts, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :attendees, -> { Internal::Types::Array[Coss::Types::SchedulingBookingAttendeesItem] }, optional: false, nullable: false

      field :location, -> { Coss::Types::SchedulingLocation }, optional: false, nullable: false

      field :hold_expires_at, -> { String }, optional: false, nullable: true

      field :approval_expires_at, -> { String }, optional: false, nullable: true

      field :series, -> { String }, optional: false, nullable: true

      field :series_index, -> { Integer }, optional: false, nullable: true

      field :group_session, -> { String }, optional: false, nullable: true

      field :calendar_unverified, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :external_conflict_at, -> { String }, optional: false, nullable: true

      field :no_show_at, -> { String }, optional: false, nullable: true

      field :cancelled_at, -> { String }, optional: false, nullable: true

      field :cancelled_by, -> { Coss::Types::SchedulingBookingCancelledBy }, optional: false, nullable: true

      field :cancellation_reason, -> { String }, optional: true, nullable: false

      field :metadata, -> { Internal::Types::Hash[String, String] }, optional: false, nullable: false

      field :created_at, -> { String }, optional: false, nullable: false

      field :updated_at, -> { String }, optional: false, nullable: false
    end
  end
end
