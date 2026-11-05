# frozen_string_literal: true

module Coss
  module Forms
    module Types
      # Who the submitter is, and whether they must confirm by email. Only the fields given change.
      class CreateFormRequestSubmitter < Internal::Types::Model
        field :email_field, -> { String }, optional: true, nullable: false

        field :verify, -> { Internal::Types::Boolean }, optional: true, nullable: false

        field :confirmation_from, -> { String }, optional: true, nullable: false
      end
    end
  end
end
