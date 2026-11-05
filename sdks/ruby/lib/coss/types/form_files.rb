# frozen_string_literal: true

module Coss
  module Types
    # File uploads.
    class FormFiles < Internal::Types::Model
      field :enabled, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :max_files, -> { Integer }, optional: false, nullable: false

      field :max_file_bytes, -> { Integer }, optional: false, nullable: false

      field :allowed_types, -> { Internal::Types::Array[String] }, optional: false, nullable: false
    end
  end
end
