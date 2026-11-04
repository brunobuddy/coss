# frozen_string_literal: true

module Coss
  module Types
    class SmsWebhookEventData < Internal::Types::Model
      field :failure, -> { Coss::Types::SmsWebhookEventDataFailure }, optional: true, nullable: false

      field :provider_error_code, -> { String }, optional: true, nullable: false

      field :suppression, -> { Coss::Types::SmsWebhookEventDataSuppression }, optional: true, nullable: false

      field :sms_id, -> { String }, optional: false, nullable: false

      field :from, -> { String }, optional: false, nullable: false

      field :to, -> { String }, optional: false, nullable: false

      field :country, -> { String }, optional: false, nullable: false

      field :segments, -> { Integer }, optional: false, nullable: false

      field :tags, -> { Internal::Types::Array[Coss::Types::SmsWebhookEventDataTagsItem] }, optional: false, nullable: false

      field :sandbox, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :occurred_at, -> { String }, optional: false, nullable: false

      field :traceparent, -> { String }, optional: true, nullable: false
    end
  end
end
