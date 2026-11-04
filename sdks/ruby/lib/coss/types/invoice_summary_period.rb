# frozen_string_literal: true

module Coss
  module Types
    # What period it covers.
    class InvoiceSummaryPeriod < Internal::Types::Model
      field :start, -> { String }, optional: false, nullable: false

      field :end_, -> { String }, optional: false, nullable: false, api_name: "end"
    end
  end
end
