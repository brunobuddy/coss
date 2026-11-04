# frozen_string_literal: true

module Coss
  module Types
    # Where a booking meets. `link`, `phone` and `in_person` carry their details, and on an event type, left blank, use
    # the booked host's own if they have one; `google_meet`, `microsoft_teams` and `zoom` get a meeting made on the
    # host's connected account.
    class SchedulingLocation < Internal::Types::Model
      extend Coss::Internal::Types::Union

      discriminant :type

      member -> { Coss::Types::SchedulingLocationLink }, key: "LINK"

      member -> { Coss::Types::SchedulingLocationPhone }, key: "PHONE"

      member -> { Coss::Types::SchedulingLocationInPerson }, key: "IN_PERSON"

      member -> { Coss::Types::SchedulingLocationGoogleMeet }, key: "GOOGLE_MEET"

      member -> { Coss::Types::SchedulingLocationMicrosoftTeams }, key: "MICROSOFT_TEAMS"

      member -> { Coss::Types::SchedulingLocationZoom }, key: "ZOOM"
    end
  end
end
