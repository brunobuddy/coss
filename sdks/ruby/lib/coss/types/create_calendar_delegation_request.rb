# frozen_string_literal: true

module Coss
  module Types
    class CreateCalendarDelegationRequest < Internal::Types::Model
      extend Coss::Internal::Types::Union

      discriminant :provider

      member -> { Coss::Types::CreateCalendarDelegationRequestGoogle }, key: "GOOGLE"

      member -> { Coss::Types::CreateCalendarDelegationRequestMicrosoft }, key: "MICROSOFT"
    end
  end
end
