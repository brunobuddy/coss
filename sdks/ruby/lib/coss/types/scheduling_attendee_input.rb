# frozen_string_literal: true

module Coss
  module Types
    # Name and email are only needed if coss.com notifies this attendee.
    class SchedulingAttendeeInput < Internal::Types::Model
      field :uid, -> { String }, optional: true, nullable: false

      field :name, -> { String }, optional: true, nullable: false

      field :email, -> { String }, optional: true, nullable: false

      field :phone, -> { String }, optional: true, nullable: false

      field :time_zone, -> { String }, optional: false, nullable: false

      field :locale, -> { String }, optional: true, nullable: false
    end
  end
end
