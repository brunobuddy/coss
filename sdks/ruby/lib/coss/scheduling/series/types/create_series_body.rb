# frozen_string_literal: true

module Coss
  module Scheduling
    module Series
      module Types
        class CreateSeriesBody < Internal::Types::Model
          field :idempotency_key, -> { String }, optional: true, nullable: false, api_name: "Idempotency-Key"

          field :body, -> { Coss::Types::CreateSeriesRequest }, optional: false, nullable: false
        end
      end
    end
  end
end
