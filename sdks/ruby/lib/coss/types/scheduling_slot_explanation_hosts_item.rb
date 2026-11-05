# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSlotExplanationHostsItem < Internal::Types::Model
      field :host, -> { String }, optional: false, nullable: false

      field :role, -> { Coss::Types::SchedulingSlotExplanationHostsItemRole }, optional: false, nullable: false

      field :available, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :reason, -> { String }, optional: false, nullable: true

      field :calendar_reason, -> { String }, optional: false, nullable: true
    end
  end
end
