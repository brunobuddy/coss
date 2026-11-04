# frozen_string_literal: true

module Coss
  module Types
    class SchedulingEventTypeHostInput < Internal::Types::Model
      field :host, -> { String }, optional: false, nullable: false

      field :role, -> { Coss::Types::SchedulingEventTypeHostInputRole }, optional: true, nullable: false

      field :weight, -> { Integer }, optional: true, nullable: false

      field :schedule, -> { String }, optional: true, nullable: false
    end
  end
end
