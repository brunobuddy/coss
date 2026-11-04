# frozen_string_literal: true

module Coss
  module Types
    # Used when a send leaves it out.
    class TemplateVariableDefault < Internal::Types::Model
      extend Coss::Internal::Types::Union

      member -> { String }

      member -> { Integer }

      member -> { Internal::Types::Boolean }
    end
  end
end
