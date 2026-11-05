# frozen_string_literal: true

module Coss
  module Types
    class SchedulingHostLocationPhone < Internal::Types::Model
      field :number, -> { String }, optional: false, nullable: false
    end
  end
end
