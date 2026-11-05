# frozen_string_literal: true

module Coss
  module Scheduling
    module EventTypes
      module Types
        class GetEventTypesRequest < Internal::Types::Model
          field :event_type, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
