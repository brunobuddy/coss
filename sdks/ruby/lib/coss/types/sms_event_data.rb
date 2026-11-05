# frozen_string_literal: true

module Coss
  module Types
    # Details of the event, where it has any.
    class SmsEventData < Internal::Types::Model
      field :failure, -> { Coss::Types::SmsEventDataFailure }, optional: true, nullable: false

      field :provider_error_code, -> { String }, optional: true, nullable: false

      field :suppression, -> { Coss::Types::SmsEventDataSuppression }, optional: true, nullable: false
    end
  end
end
