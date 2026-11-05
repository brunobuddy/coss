# frozen_string_literal: true

module Coss
  module Scheduling
    module Calendars
      module Types
        module AuthorizeCalendarRequestProvider
          extend Coss::Internal::Types::Enum

          GOOGLE = "google"
          MICROSOFT = "microsoft"
          ZOOM = "zoom"
        end
      end
    end
  end
end
