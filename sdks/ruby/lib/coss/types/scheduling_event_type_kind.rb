# frozen_string_literal: true

module Coss
  module Types
    module SchedulingEventTypeKind
      extend Coss::Internal::Types::Enum

      ONE_ON_ONE = "one_on_one"
      POOL = "pool"
      COLLECTIVE = "collective"
      GROUP = "group"
    end
  end
end
