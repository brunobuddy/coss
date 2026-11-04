# frozen_string_literal: true

module Coss
  module Types
    # How often the booking repeats, at the attendee's local time.
    class CreateSeriesRequestRecurrence < Internal::Types::Model
      field :frequency, -> { Coss::Types::CreateSeriesRequestRecurrenceFrequency }, optional: false, nullable: false

      field :interval, -> { Integer }, optional: true, nullable: false

      field :count, -> { Integer }, optional: false, nullable: false
    end
  end
end
