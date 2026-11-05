# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSlotExplanation < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingSlotExplanationObject }, optional: false, nullable: false

      field :start, -> { String }, optional: false, nullable: false

      field :end_, -> { String }, optional: false, nullable: false, api_name: "end"

      field :available, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :reason, -> { String }, optional: false, nullable: true

      field :hosts, -> { Internal::Types::Array[Coss::Types::SchedulingSlotExplanationHostsItem] }, optional: false, nullable: false
    end
  end
end
