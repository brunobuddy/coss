# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        # One of the event type's `locations`, with your link filled in if it has none.
        class CreateBookingRequestLocation < Internal::Types::Model
          extend Coss::Internal::Types::Union

          discriminant :type

          member -> { Coss::Scheduling::Bookings::Types::CreateBookingRequestLocationLink }, key: "LINK"

          member -> { Coss::Scheduling::Bookings::Types::CreateBookingRequestLocationPhone }, key: "PHONE"

          member -> { Coss::Scheduling::Bookings::Types::CreateBookingRequestLocationInPerson }, key: "IN_PERSON"

          member -> { Coss::Scheduling::Bookings::Types::CreateBookingRequestLocationGoogleMeet }, key: "GOOGLE_MEET"

          member -> { Coss::Scheduling::Bookings::Types::CreateBookingRequestLocationMicrosoftTeams }, key: "MICROSOFT_TEAMS"

          member -> { Coss::Scheduling::Bookings::Types::CreateBookingRequestLocationZoom }, key: "ZOOM"
        end
      end
    end
  end
end
