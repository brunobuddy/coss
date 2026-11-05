# frozen_string_literal: true

module Coss
  module Scheduling
    module Calendars
      module Types
        class SetSimulatedBusyRequest < Internal::Types::Model
          field :host, -> { String }, optional: false, nullable: false

          field :intervals, -> { Internal::Types::Array[Coss::Scheduling::Calendars::Types::SetSimulatedBusyRequestIntervalsItem] }, optional: false, nullable: false
        end
      end
    end
  end
end
