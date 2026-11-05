# frozen_string_literal: true

module Coss
  module Types
    # The page coss.com can serve for this form.
    class FormHosted < Internal::Types::Model
      field :enabled, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :title, -> { String }, optional: false, nullable: true

      field :description, -> { String }, optional: false, nullable: true

      field :submit_label, -> { String }, optional: false, nullable: true

      field :success_message, -> { String }, optional: false, nullable: true

      field :published_at, -> { String }, optional: false, nullable: true
    end
  end
end
