# frozen_string_literal: true

module Coss
  module Types
    # One button in the email. Needs `email_from`.
    class SchedulingReminderInputButton < Internal::Types::Model
      field :label, -> { String }, optional: false, nullable: false

      field :url, -> { String }, optional: false, nullable: false
    end
  end
end
