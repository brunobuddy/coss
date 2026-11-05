# frozen_string_literal: true

module Coss
  module Types
    # The broadcast and how it fared.
    class BroadcastWebhookEventData < Internal::Types::Model
      field :broadcast, -> { Coss::Types::BroadcastWebhookEventDataBroadcast }, optional: false, nullable: false

      field :pause_reason, -> { String }, optional: false, nullable: true

      field :error, -> { Coss::Types::BroadcastWebhookEventDataError }, optional: false, nullable: true

      field :stats, -> { Coss::Types::BroadcastStats }, optional: false, nullable: false

      field :occurred_at, -> { String }, optional: false, nullable: false
    end
  end
end
