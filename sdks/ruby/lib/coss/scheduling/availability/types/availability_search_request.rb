# frozen_string_literal: true

module Coss
  module Scheduling
    module Availability
      module Types
        class AvailabilitySearchRequest < Internal::Types::Model
          field :event_type, -> { String }, optional: false, nullable: false

          field :start, -> { String }, optional: false, nullable: false

          field :end_, -> { String }, optional: false, nullable: false, api_name: "end"

          field :attributes, -> { Internal::Types::Hash[String, Coss::Scheduling::Availability::Types::AvailabilitySearchRequestAttributesValue] }, optional: true, nullable: false

          field :hosts, -> { Internal::Types::Array[String] }, optional: true, nullable: false

          field :slots_per_host, -> { Integer }, optional: true, nullable: false

          field :limit, -> { Integer }, optional: true, nullable: false
        end
      end
    end
  end
end
