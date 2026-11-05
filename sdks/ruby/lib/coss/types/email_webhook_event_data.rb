# frozen_string_literal: true

module Coss
  module Types
    class EmailWebhookEventData < Internal::Types::Model
      field :bounce, -> { Coss::Types::EmailWebhookEventDataBounce }, optional: true, nullable: false

      field :complaint, -> { Coss::Types::EmailWebhookEventDataComplaint }, optional: true, nullable: false

      field :delay, -> { Coss::Types::EmailWebhookEventDataDelay }, optional: true, nullable: false

      field :delivery, -> { Coss::Types::EmailWebhookEventDataDelivery }, optional: true, nullable: false

      field :failure, -> { Coss::Types::EmailWebhookEventDataFailure }, optional: true, nullable: false

      field :suppression, -> { Coss::Types::EmailWebhookEventDataSuppression }, optional: true, nullable: false

      field :unsubscribe, -> { Coss::Types::EmailWebhookEventDataUnsubscribe }, optional: true, nullable: false

      field :open, -> { Coss::Types::EmailWebhookEventDataOpen }, optional: true, nullable: false

      field :click, -> { Coss::Types::EmailWebhookEventDataClick }, optional: true, nullable: false

      field :reschedule, -> { Coss::Types::EmailWebhookEventDataReschedule }, optional: true, nullable: false

      field :email_id, -> { String }, optional: false, nullable: false

      field :from, -> { String }, optional: false, nullable: false

      field :to, -> { Internal::Types::Array[String] }, optional: false, nullable: false

      field :subject, -> { String }, optional: false, nullable: false

      field :tags, -> { Internal::Types::Array[Coss::Types::EmailWebhookEventDataTagsItem] }, optional: false, nullable: false

      field :category, -> { String }, optional: false, nullable: true

      field :sandbox, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :recipient, -> { String }, optional: false, nullable: true

      field :occurred_at, -> { String }, optional: false, nullable: false

      field :subaccount_id, -> { String }, optional: true, nullable: false

      field :traceparent, -> { String }, optional: true, nullable: false
    end
  end
end
