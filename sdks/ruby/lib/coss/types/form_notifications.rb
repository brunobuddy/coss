# frozen_string_literal: true

module Coss
  module Types
    # Emails about accepted submissions.
    class FormNotifications < Internal::Types::Model
      field :recipients, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :from, -> { String }, optional: false, nullable: true
    end
  end
end
