# frozen_string_literal: true

module Coss
  module Scheduling
    module Calendars
      module Types
        class SetSimulatedBusyRequestIntervalsItem < Internal::Types::Model
          field :start, -> { String }, optional: false, nullable: false

          field :end_, -> { String }, optional: false, nullable: false, api_name: "end"
        end
      end
    end
  end
end
