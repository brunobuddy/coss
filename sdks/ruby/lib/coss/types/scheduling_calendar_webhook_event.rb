# frozen_string_literal: true

module Coss
  module Types
    class SchedulingCalendarWebhookEvent < Internal::Types::Model
      field :id, -> { String }, optional: false, nullable: false

      field :object, -> { Coss::Types::SchedulingCalendarWebhookEventObject }, optional: false, nullable: false

      field :api_version, -> { String }, optional: false, nullable: false

      field :created_at, -> { String }, optional: false, nullable: false

      field :type, -> { Coss::Types::SchedulingCalendarWebhookEventType }, optional: false, nullable: false

      field :data, -> { Coss::Types::SchedulingCalendarWebhookEventData }, optional: false, nullable: false
    end
  end
end
