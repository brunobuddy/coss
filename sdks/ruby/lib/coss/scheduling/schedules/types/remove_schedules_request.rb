# frozen_string_literal: true

module Coss
  module Scheduling
    module Schedules
      module Types
        class RemoveSchedulesRequest < Internal::Types::Model
          field :host, -> { String }, optional: false, nullable: false

          field :schedule_id, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
