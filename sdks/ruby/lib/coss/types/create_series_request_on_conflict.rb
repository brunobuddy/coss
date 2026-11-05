# frozen_string_literal: true

module Coss
  module Types
    module CreateSeriesRequestOnConflict
      extend Coss::Internal::Types::Enum

      REJECT = "reject"
      SKIP = "skip"
    end
  end
end
