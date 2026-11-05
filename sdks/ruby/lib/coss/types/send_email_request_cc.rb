# frozen_string_literal: true

module Coss
  module Types
    # Who it's copied to.
    class SendEmailRequestCc < Internal::Types::Model
      extend Coss::Internal::Types::Union

      member -> { String }

      member -> { Internal::Types::Array[String] }
    end
  end
end
