# frozen_string_literal: true

module Coss
  module Scheduling
    module Calendars
      module Types
        class UpdateCalendarRequest < Internal::Types::Model
          field :host, -> { String }, optional: false, nullable: false

          field :calendar_id, -> { String }, optional: false, nullable: false

          field :read_busy, -> { Internal::Types::Boolean }, optional: true, nullable: false

          field :write_target, -> { Internal::Types::Boolean }, optional: true, nullable: false
        end
      end
    end
  end
end
