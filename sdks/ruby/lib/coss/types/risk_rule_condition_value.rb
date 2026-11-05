# frozen_string_literal: true

module Coss
  module Types
    # What to compare it with: its type follows the field, and `in` and `not_in` take a list of strings.
    class RiskRuleConditionValue < Internal::Types::Model
      extend Coss::Internal::Types::Union

      member -> { Internal::Types::Boolean }

      member -> { Integer }

      member -> { String }

      member -> { Internal::Types::Array[String] }
    end
  end
end
