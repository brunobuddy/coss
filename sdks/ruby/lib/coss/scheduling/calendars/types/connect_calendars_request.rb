# frozen_string_literal: true

module Coss
  module Scheduling
    module Calendars
      module Types
        class ConnectCalendarsRequest < Internal::Types::Model
          field :host, -> { String }, optional: false, nullable: false

          field :body, -> { Coss::Types::CreateCalendarConnectionRequest }, optional: false, nullable: false
        end
      end
    end
  end
end
