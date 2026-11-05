# frozen_string_literal: true

module Coss
  module Types
    class SchedulingEventTypeHostsItem < Internal::Types::Model
      field :host, -> { String }, optional: false, nullable: false

      field :role, -> { Coss::Types::SchedulingEventTypeHostsItemRole }, optional: false, nullable: false

      field :weight, -> { Integer }, optional: false, nullable: false

      field :schedule, -> { String }, optional: false, nullable: true
    end
  end
end
