# frozen_string_literal: true

module Coss
  module Types
    # The project it belongs to.
    class EnvironmentProject < Internal::Types::Model
      field :id, -> { String }, optional: false, nullable: false

      field :name, -> { String }, optional: false, nullable: false

      field :slug, -> { String }, optional: false, nullable: false
    end
  end
end
