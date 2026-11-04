# frozen_string_literal: true

module Coss
  module Forms
    module Types
      # File uploads. Only the fields given change.
      class CreateFormRequestFiles < Internal::Types::Model
        field :enabled, -> { Internal::Types::Boolean }, optional: true, nullable: false

        field :max_files, -> { Integer }, optional: true, nullable: false

        field :max_file_bytes, -> { Integer }, optional: true, nullable: false

        field :allowed_types, -> { Internal::Types::Array[String] }, optional: true, nullable: false
      end
    end
  end
end
