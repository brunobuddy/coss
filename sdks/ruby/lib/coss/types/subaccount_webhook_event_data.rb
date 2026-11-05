# frozen_string_literal: true

module Coss
  module Types
    # The sub-account's standing.
    class SubaccountWebhookEventData < Internal::Types::Model
      field :subaccount_id, -> { String }, optional: false, nullable: false

      field :uid, -> { String }, optional: false, nullable: true

      field :status, -> { Coss::Types::SubaccountWebhookEventDataStatus }, optional: false, nullable: false

      field :previous_status, -> { Coss::Types::SubaccountWebhookEventDataPreviousStatus }, optional: false, nullable: false

      field :trigger, -> { String }, optional: false, nullable: true

      field :occurred_at, -> { String }, optional: false, nullable: false

      field :checks, -> { Internal::Types::Array[Coss::Types::ReputationCheck] }, optional: false, nullable: false
    end
  end
end
