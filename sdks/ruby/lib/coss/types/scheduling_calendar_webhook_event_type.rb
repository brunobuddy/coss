# frozen_string_literal: true

module Coss
  module Types
    module SchedulingCalendarWebhookEventType
      extend Coss::Internal::Types::Enum

      SCHEDULING_CALENDAR_CONNECTED = "scheduling.calendar.connected"
      SCHEDULING_CALENDAR_NEEDS_REAUTH = "scheduling.calendar.needs_reauth"
      SCHEDULING_CALENDAR_DISCONNECTED = "scheduling.calendar.disconnected"
    end
  end
end
