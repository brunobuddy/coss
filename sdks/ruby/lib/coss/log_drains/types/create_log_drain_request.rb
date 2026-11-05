# frozen_string_literal: true

module Coss
  module LogDrains
    module Types
      class CreateLogDrainRequest < Internal::Types::Model
        field :url, -> { String }, optional: false, nullable: false

        field :description, -> { String }, optional: true, nullable: false

        field :sources, -> { Internal::Types::Array[Coss::Types::LogDrainSource] }, optional: true, nullable: false

        field :format, -> { Coss::LogDrains::Types::CreateLogDrainRequestFormat }, optional: true, nullable: false

        field :auth_header, -> { Coss::Types::LogDrainAuthHeader }, optional: true, nullable: false
      end
    end
  end
end
