# frozen_string_literal: true

module Coss
  module Types
    # Who it's blind copied to.
    class SendEmailRequestBcc < Internal::Types::Model
      extend Coss::Internal::Types::Union

      member -> { String }

      member -> { Internal::Types::Array[String] }
    end
  end
end
