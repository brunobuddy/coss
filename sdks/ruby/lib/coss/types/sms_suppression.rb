# frozen_string_literal: true

module Coss
  module Types
    # A number sends skip.
    class SmsSuppression < Internal::Types::Model
      field :object, -> { Coss::Types::SmsSuppressionObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :phone_number, -> { String }, optional: false, nullable: false

      field :reason, -> { Coss::Types::SmsSuppressionReason }, optional: false, nullable: false

      field :sms_id, -> { String }, optional: false, nullable: true

      field :created_at, -> { String }, optional: false, nullable: false
    end
  end
end
