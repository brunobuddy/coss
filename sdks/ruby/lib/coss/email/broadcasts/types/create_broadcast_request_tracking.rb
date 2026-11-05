# frozen_string_literal: true

module Coss
  module Email
    module Broadcasts
      module Types
        # Which opens and clicks are tracked.
        class CreateBroadcastRequestTracking < Internal::Types::Model
          field :opens, -> { Internal::Types::Boolean }, optional: true, nullable: false

          field :clicks, -> { Internal::Types::Boolean }, optional: true, nullable: false
        end
      end
    end
  end
end
