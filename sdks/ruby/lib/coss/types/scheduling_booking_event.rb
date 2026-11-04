# frozen_string_literal: true

module Coss
  module Types
    class SchedulingBookingEvent < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingBookingEventObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :sequence, -> { Integer }, optional: false, nullable: false

      field :type, -> { String }, optional: false, nullable: false

      field :actor, -> { Coss::Types::SchedulingBookingEventActor }, optional: false, nullable: false

      field :details, -> { Internal::Types::Hash[String, Object] }, optional: false, nullable: false

      field :occurred_at, -> { String }, optional: false, nullable: false
    end
  end
end
