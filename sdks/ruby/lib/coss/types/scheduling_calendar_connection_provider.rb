# frozen_string_literal: true

module Coss
  module Types
    module SchedulingCalendarConnectionProvider
      extend Coss::Internal::Types::Enum

      GOOGLE = "google"
      MICROSOFT = "microsoft"
      CALDAV = "caldav"
      SIMULATED = "simulated"
      ZOOM = "zoom"
    end
  end
end
