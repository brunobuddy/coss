# frozen_string_literal: true

module Coss
  module Types
    # The host and calendar connection this is about.
    class SchedulingCalendarWebhookEventData < Internal::Types::Model
      field :host_id, -> { String }, optional: false, nullable: false

      field :connection_id, -> { String }, optional: false, nullable: false

      field :provider, -> { String }, optional: false, nullable: false

      field :occurred_at, -> { String }, optional: false, nullable: false
    end
  end
end
