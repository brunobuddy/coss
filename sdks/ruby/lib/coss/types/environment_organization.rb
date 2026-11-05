# frozen_string_literal: true

module Coss
  module Types
    # The organization it belongs to.
    class EnvironmentOrganization < Internal::Types::Model
      field :id, -> { String }, optional: false, nullable: false

      field :name, -> { String }, optional: false, nullable: false

      field :slug, -> { String }, optional: false, nullable: false

      field :api_version, -> { String }, optional: false, nullable: false

      field :hipaa_mode, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
