# frozen_string_literal: true

module Coss
  module Types
    # Someone else coming along. They're emailed about the booking, with no manage link.
    class SchedulingGuestInput < Internal::Types::Model
      field :email, -> { String }, optional: false, nullable: false

      field :name, -> { String }, optional: true, nullable: false
    end
  end
end
