# frozen_string_literal: true

module Coss
  module Scheduling
    module EventTypes
      module Types
        module CreateEventTypeRequestKind
          extend Coss::Internal::Types::Enum

          ONE_ON_ONE = "one_on_one"
          POOL = "pool"
          COLLECTIVE = "collective"
          GROUP = "group"
        end
      end
    end
  end
end
