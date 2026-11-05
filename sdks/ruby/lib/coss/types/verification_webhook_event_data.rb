# frozen_string_literal: true

module Coss
  module Types
    # The verification. Never its code.
    class VerificationWebhookEventData < Internal::Types::Model
      field :verification_id, -> { String }, optional: false, nullable: false

      field :channel, -> { Coss::Types::VerificationWebhookEventDataChannel }, optional: false, nullable: false

      field :to, -> { String }, optional: false, nullable: false

      field :status, -> { Coss::Types::VerificationWebhookEventDataStatus }, optional: false, nullable: false

      field :failure, -> { Coss::Types::VerificationWebhookEventDataFailure }, optional: false, nullable: true

      field :reasons, -> { Internal::Types::Array[Coss::Types::VerificationWebhookEventDataReasonsItem] }, optional: false, nullable: false

      field :tags, -> { Internal::Types::Array[Coss::Types::VerificationWebhookEventDataTagsItem] }, optional: false, nullable: false

      field :sandbox, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :occurred_at, -> { String }, optional: false, nullable: false
    end
  end
end
