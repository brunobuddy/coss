# frozen_string_literal: true

module Coss
  module Scheduling
    module Holds
      module Types
        # One of the event type's `locations`, with your link filled in if it has none.
        class CreateHoldRequestLocation < Internal::Types::Model
          extend Coss::Internal::Types::Union

          discriminant :type

          member -> { Coss::Scheduling::Holds::Types::CreateHoldRequestLocationLink }, key: "LINK"

          member -> { Coss::Scheduling::Holds::Types::CreateHoldRequestLocationPhone }, key: "PHONE"

          member -> { Coss::Scheduling::Holds::Types::CreateHoldRequestLocationInPerson }, key: "IN_PERSON"

          member -> { Coss::Scheduling::Holds::Types::CreateHoldRequestLocationGoogleMeet }, key: "GOOGLE_MEET"

          member -> { Coss::Scheduling::Holds::Types::CreateHoldRequestLocationMicrosoftTeams }, key: "MICROSOFT_TEAMS"

          member -> { Coss::Scheduling::Holds::Types::CreateHoldRequestLocationZoom }, key: "ZOOM"
        end
      end
    end
  end
end
