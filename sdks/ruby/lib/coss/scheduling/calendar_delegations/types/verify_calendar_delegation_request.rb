# frozen_string_literal: true

module Coss
  module Scheduling
    module CalendarDelegations
      module Types
        class VerifyCalendarDelegationRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false

          field :account, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
