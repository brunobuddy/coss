# frozen_string_literal: true

module Coss
  module Scheduling
    module Slots
      module Types
        class ListSlotsRequest < Internal::Types::Model
          field :event_type, -> { String }, optional: false, nullable: false

          field :start, -> { String }, optional: false, nullable: false

          field :end_, -> { String }, optional: false, nullable: false, api_name: "end"

          field :host, -> { String }, optional: true, nullable: false

          field :duration_minutes, -> { Integer }, optional: true, nullable: false

          field :attributes, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
