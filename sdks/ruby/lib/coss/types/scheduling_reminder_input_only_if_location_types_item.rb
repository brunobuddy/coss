# frozen_string_literal: true

module Coss
  module Types
    module SchedulingReminderInputOnlyIfLocationTypesItem
      extend Coss::Internal::Types::Enum

      LINK = "link"
      PHONE = "phone"
      IN_PERSON = "in_person"
      GOOGLE_MEET = "google_meet"
      MICROSOFT_TEAMS = "microsoft_teams"
      ZOOM = "zoom"
    end
  end
end
