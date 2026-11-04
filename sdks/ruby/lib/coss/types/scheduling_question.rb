# frozen_string_literal: true

module Coss
  module Types
    # Something attendees are asked when booking. Answers are encrypted, and come back only when you retrieve one
    # booking.
    class SchedulingQuestion < Internal::Types::Model
      field :key, -> { String }, optional: false, nullable: false

      field :type, -> { Coss::Types::SchedulingQuestionType }, optional: false, nullable: false

      field :label, -> { String }, optional: false, nullable: false

      field :required, -> { Internal::Types::Boolean }, optional: true, nullable: false

      field :options, -> { Internal::Types::Array[String] }, optional: true, nullable: false
    end
  end
end
