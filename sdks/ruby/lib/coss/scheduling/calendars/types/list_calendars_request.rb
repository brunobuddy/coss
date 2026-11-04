# frozen_string_literal: true

module Coss
  module Scheduling
    module Calendars
      module Types
        class ListCalendarsRequest < Internal::Types::Model
          field :host, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
