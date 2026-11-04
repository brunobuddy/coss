# frozen_string_literal: true

module Coss
  module Forms
    module Types
      # Turning submissions into contacts. Only the fields given change.
      class CreateFormRequestContacts < Internal::Types::Model
        field :enabled, -> { Internal::Types::Boolean }, optional: true, nullable: false

        field :audience_ids, -> { Internal::Types::Array[String] }, optional: true, nullable: false

        field :topics, -> { Internal::Types::Array[String] }, optional: true, nullable: false

        field :double_opt_in, -> { Internal::Types::Boolean }, optional: true, nullable: false

        field :first_name_field, -> { String }, optional: true, nullable: false

        field :last_name_field, -> { String }, optional: true, nullable: false

        field :properties, -> { Internal::Types::Hash[String, String] }, optional: true, nullable: false
      end
    end
  end
end
