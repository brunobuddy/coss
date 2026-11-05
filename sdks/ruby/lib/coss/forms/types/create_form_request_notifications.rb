# frozen_string_literal: true

module Coss
  module Forms
    module Types
      # Emails about accepted submissions. Only the fields given change.
      class CreateFormRequestNotifications < Internal::Types::Model
        field :recipients, -> { Internal::Types::Array[String] }, optional: true, nullable: false

        field :from, -> { String }, optional: true, nullable: false
      end
    end
  end
end
