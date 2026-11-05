# frozen_string_literal: true

module Coss
  module Types
    # What the aggregate reports of this period say.
    class DomainDmarcReportSummary < Internal::Types::Model
      field :period_start, -> { String }, optional: false, nullable: false

      field :period_end, -> { String }, optional: false, nullable: false

      field :reports, -> { Integer }, optional: false, nullable: false

      field :messages, -> { Integer }, optional: false, nullable: false

      field :passing, -> { Integer }, optional: false, nullable: false

      field :coss_messages, -> { Integer }, optional: false, nullable: false

      field :coss_passing, -> { Integer }, optional: false, nullable: false

      field :first_report_at, -> { String }, optional: false, nullable: true

      field :last_report_at, -> { String }, optional: false, nullable: true

      field :sources, -> { Internal::Types::Array[Coss::Types::DmarcSource] }, optional: false, nullable: false
    end
  end
end
