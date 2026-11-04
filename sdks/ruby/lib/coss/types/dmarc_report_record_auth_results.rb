# frozen_string_literal: true

module Coss
  module Types
    # What receivers saw for DKIM and SPF.
    class DmarcReportRecordAuthResults < Internal::Types::Model
      field :dkim, -> { Internal::Types::Array[Coss::Types::DmarcReportRecordAuthResultsDkimItem] }, optional: false, nullable: false

      field :spf, -> { Internal::Types::Array[Coss::Types::DmarcReportRecordAuthResultsSpfItem] }, optional: false, nullable: false
    end
  end
end
