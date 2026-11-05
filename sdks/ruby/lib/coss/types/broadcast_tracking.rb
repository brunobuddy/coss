# frozen_string_literal: true

module Coss
  module Types
    # Which opens and clicks are tracked.
    class BroadcastTracking < Internal::Types::Model
      field :opens, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :clicks, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
