# frozen_string_literal: true

module Coss
  module Scheduling
    module Attendees
      module Types
        class EraseSchedulingAttendeeByEmailRequest < Internal::Types::Model
          field :email, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
