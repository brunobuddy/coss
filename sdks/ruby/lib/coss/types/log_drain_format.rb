# frozen_string_literal: true

module Coss
  module Types
    module LogDrainFormat
      extend Coss::Internal::Types::Enum

      NDJSON = "ndjson"
      LOKI = "loki"
      DATADOG = "datadog"
      OTLP = "otlp"
    end
  end
end
