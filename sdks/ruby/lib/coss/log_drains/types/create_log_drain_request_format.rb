# frozen_string_literal: true

module Coss
  module LogDrains
    module Types
      module CreateLogDrainRequestFormat
        extend Coss::Internal::Types::Enum

        NDJSON = "ndjson"
        LOKI = "loki"
        DATADOG = "datadog"
        OTLP = "otlp"
      end
    end
  end
end
