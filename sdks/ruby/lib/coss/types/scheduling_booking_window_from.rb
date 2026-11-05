# frozen_string_literal: true

module Coss
  module Types
    class SchedulingBookingWindowFrom < Internal::Types::Model
      field :kind, -> { Coss::Types::SchedulingBookingWindowFromKind }, optional: false, nullable: false

      field :from, -> { String }, optional: false, nullable: false

      field :to, -> { String }, optional: false, nullable: false
    end
  end
end
