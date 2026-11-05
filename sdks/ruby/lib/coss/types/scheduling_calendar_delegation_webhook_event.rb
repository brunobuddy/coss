# frozen_string_literal: true

module Coss
  module Types
    class SchedulingCalendarDelegationWebhookEvent < Internal::Types::Model
      field :id, -> { String }, optional: false, nullable: false

      field :object, -> { Coss::Types::SchedulingCalendarDelegationWebhookEventObject }, optional: false, nullable: false

      field :api_version, -> { String }, optional: false, nullable: false

      field :created_at, -> { String }, optional: false, nullable: false

      field :type, -> { Coss::Types::SchedulingCalendarDelegationWebhookEventType }, optional: false, nullable: false

      field :data, -> { Coss::Types::SchedulingCalendarDelegationWebhookEventData }, optional: false, nullable: false
    end
  end
end
