# frozen_string_literal: true

module Coss
  module Types
    # The assessment, without its signals.
    class RiskWebhookEventData < Internal::Types::Model
      field :assessment_id, -> { String }, optional: false, nullable: false

      field :event, -> { Coss::Types::RiskEvent }, optional: false, nullable: false

      field :event_name, -> { String }, optional: false, nullable: true

      field :decision, -> { Coss::Types::RiskDecision }, optional: false, nullable: false

      field :score, -> { Integer }, optional: false, nullable: false

      field :reasons, -> { Internal::Types::Array[Coss::Types::RiskReason] }, optional: false, nullable: false

      field :user_id, -> { String }, optional: false, nullable: true

      field :outcome, -> { Coss::Types::RiskOutcome }, optional: false, nullable: true

      field :occurred_at, -> { String }, optional: false, nullable: false
    end
  end
end
