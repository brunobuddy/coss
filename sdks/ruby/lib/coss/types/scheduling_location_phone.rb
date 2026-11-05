# frozen_string_literal: true

module Coss
  module Types
    class SchedulingLocationPhone < Internal::Types::Model
      field :number, -> { String }, optional: true, nullable: false
    end
  end
end
