# frozen_string_literal: true

module Coss
  module Types
    # One of the event type's `locations`, with your link filled in if it has none.
    class CreateSeriesRequestLocation < Internal::Types::Model
      extend Coss::Internal::Types::Union

      discriminant :type

      member -> { Coss::Types::CreateSeriesRequestLocationLink }, key: "LINK"

      member -> { Coss::Types::CreateSeriesRequestLocationPhone }, key: "PHONE"

      member -> { Coss::Types::CreateSeriesRequestLocationInPerson }, key: "IN_PERSON"

      member -> { Coss::Types::CreateSeriesRequestLocationGoogleMeet }, key: "GOOGLE_MEET"

      member -> { Coss::Types::CreateSeriesRequestLocationMicrosoftTeams }, key: "MICROSOFT_TEAMS"

      member -> { Coss::Types::CreateSeriesRequestLocationZoom }, key: "ZOOM"
    end
  end
end
