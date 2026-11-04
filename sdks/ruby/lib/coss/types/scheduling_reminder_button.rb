# frozen_string_literal: true

module Coss
  module Types
    # One button in the email. `null`: none.
    class SchedulingReminderButton < Internal::Types::Model
      field :label, -> { String }, optional: false, nullable: false

      field :url, -> { String }, optional: false, nullable: false
    end
  end
end
