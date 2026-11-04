# frozen_string_literal: true

module Coss
  module Types
    class SchedulingCalendarConnectionCalendarsItem < Internal::Types::Model
      field :id, -> { String }, optional: false, nullable: false

      field :external_id, -> { String }, optional: false, nullable: false

      field :read_busy, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :write_target, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :verified_at, -> { String }, optional: false, nullable: true
    end
  end
end
