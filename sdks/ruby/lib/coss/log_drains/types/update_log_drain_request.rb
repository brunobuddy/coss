# frozen_string_literal: true

module Coss
  module LogDrains
    module Types
      class UpdateLogDrainRequest < Internal::Types::Model
        field :id, -> { String }, optional: false, nullable: false

        field :url, -> { String }, optional: true, nullable: false

        field :description, -> { String }, optional: true, nullable: false

        field :sources, -> { Internal::Types::Array[Coss::Types::LogDrainSource] }, optional: true, nullable: false

        field :format, -> { Coss::Types::LogDrainFormat }, optional: true, nullable: false

        field :auth_header, -> { Coss::Types::LogDrainAuthHeader }, optional: true, nullable: false

        field :enabled, -> { Internal::Types::Boolean }, optional: true, nullable: false
      end
    end
  end
end
