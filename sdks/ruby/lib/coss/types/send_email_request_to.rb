# frozen_string_literal: true

module Coss
  module Types
    # Who it goes to.
    class SendEmailRequestTo < Internal::Types::Model
      extend Coss::Internal::Types::Union

      member -> { String }

      member -> { Internal::Types::Array[String] }
    end
  end
end
