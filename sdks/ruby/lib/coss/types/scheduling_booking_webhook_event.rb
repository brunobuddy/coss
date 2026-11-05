# frozen_string_literal: true

module Coss
  module Types
    class SchedulingBookingWebhookEvent < Internal::Types::Model
      field :id, -> { String }, optional: false, nullable: false

      field :object, -> { Coss::Types::SchedulingBookingWebhookEventObject }, optional: false, nullable: false

      field :api_version, -> { String }, optional: false, nullable: false

      field :created_at, -> { String }, optional: false, nullable: false

      field :type, -> { Coss::Types::SchedulingBookingWebhookEventType }, optional: false, nullable: false

      field :data, -> { Coss::Types::SchedulingBookingWebhookData }, optional: false, nullable: false
    end
  end
end
