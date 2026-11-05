# frozen_string_literal: true

module Coss
  module Types
    class SchedulingCalendarDelegationWebhookEventData < Internal::Types::Model
      field :delegation_id, -> { String }, optional: false, nullable: false

      field :provider, -> { String }, optional: false, nullable: false

      field :domain, -> { String }, optional: false, nullable: false

      field :code, -> { String }, optional: false, nullable: true

      field :occurred_at, -> { String }, optional: false, nullable: false
    end
  end
end
