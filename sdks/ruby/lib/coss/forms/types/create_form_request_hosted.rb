# frozen_string_literal: true

module Coss
  module Forms
    module Types
      # The page coss.com can serve for this form. Only the fields given change.
      class CreateFormRequestHosted < Internal::Types::Model
        field :enabled, -> { Internal::Types::Boolean }, optional: true, nullable: false

        field :title, -> { String }, optional: true, nullable: false

        field :description, -> { String }, optional: true, nullable: false

        field :submit_label, -> { String }, optional: true, nullable: false

        field :success_message, -> { String }, optional: true, nullable: false
      end
    end
  end
end
