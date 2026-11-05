# frozen_string_literal: true

module Coss
  module Types
    # The contact, without its properties.
    class ContactWebhookEventData < Internal::Types::Model
      field :contact, -> { Coss::Types::ContactWebhookEventDataContact }, optional: false, nullable: false

      field :source, -> { Coss::Types::ContactWebhookEventDataSource }, optional: false, nullable: false

      field :topic, -> { String }, optional: false, nullable: true

      field :occurred_at, -> { String }, optional: false, nullable: false
    end
  end
end
