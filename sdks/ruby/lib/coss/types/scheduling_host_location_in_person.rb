# frozen_string_literal: true

module Coss
  module Types
    class SchedulingHostLocationInPerson < Internal::Types::Model
      field :address, -> { String }, optional: false, nullable: false
    end
  end
end
