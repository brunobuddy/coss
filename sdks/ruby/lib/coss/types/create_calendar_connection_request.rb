# frozen_string_literal: true

module Coss
  module Types
    # `caldav` connects a server with an app-specific password; `simulated` is a sandbox calendar for tests.
    class CreateCalendarConnectionRequest < Internal::Types::Model
      extend Coss::Internal::Types::Union

      discriminant :provider

      member -> { Coss::Types::CreateCalendarConnectionRequestCaldav }, key: "CALDAV"

      member -> { Coss::Types::CreateCalendarConnectionRequestSimulated }, key: "SIMULATED"
    end
  end
end
