# frozen_string_literal: true

module Coss
  module Scheduling
    module Schedules
      module Types
        class ListSchedulesRequest < Internal::Types::Model
          field :host, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
