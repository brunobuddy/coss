# frozen_string_literal: true

module Coss
  module Scheduling
    module Attendees
      module Types
        class EraseAttendeesRequest < Internal::Types::Model
          field :uid, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
