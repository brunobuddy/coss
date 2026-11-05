# frozen_string_literal: true

module Coss
  module Types
    # Turning submissions into contacts.
    class FormContacts < Internal::Types::Model
      field :enabled, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :audience_ids, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :topics, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :double_opt_in, -> { Internal::Types::Boolean }, optional: false, nullable: true

      field :first_name_field, -> { String }, optional: false, nullable: true

      field :last_name_field, -> { String }, optional: false, nullable: true

      field :properties, -> { Internal::Types::Hash[String, String] }, optional: false, nullable: false
    end
  end
end
