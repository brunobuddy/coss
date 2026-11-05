# frozen_string_literal: true

module Coss
  module Scheduling
    module Series
      module Types
        class CancelSeriesRequest < Internal::Types::Model
          field :id, -> { String }, optional: false, nullable: false

          field :from_index, -> { Integer }, optional: true, nullable: false
        end
      end
    end
  end
end
