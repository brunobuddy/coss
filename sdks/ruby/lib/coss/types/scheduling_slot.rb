# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSlot < Internal::Types::Model
      field :start, -> { String }, optional: false, nullable: false

      field :end_, -> { String }, optional: false, nullable: false, api_name: "end"

      field :hosts, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :seats_left, -> { Integer }, optional: false, nullable: true
    end
  end
end
