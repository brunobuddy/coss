# frozen_string_literal: true

module Coss
  module Types
    # The request. Never documents or field values.
    class SignRequestWebhookEventData < Internal::Types::Model
      field :sign_request_id, -> { String }, optional: false, nullable: false

      field :status, -> { Coss::Types::SignRequestWebhookEventDataStatus }, optional: false, nullable: false

      field :title, -> { String }, optional: false, nullable: false

      field :metadata, -> { Internal::Types::Hash[String, String] }, optional: false, nullable: false

      field :signer, -> { Coss::Types::SignRequestWebhookEventDataSigner }, optional: false, nullable: true

      field :reason, -> { String }, optional: false, nullable: true

      field :sandbox, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :occurred_at, -> { String }, optional: false, nullable: false
    end
  end
end
