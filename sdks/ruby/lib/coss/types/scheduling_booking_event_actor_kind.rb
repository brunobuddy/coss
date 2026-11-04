# frozen_string_literal: true

module Coss
  module Types
    module SchedulingBookingEventActorKind
      extend Coss::Internal::Types::Enum

      API_KEY = "api_key"
      USER = "user"
      HOST_SESSION = "host_session"
      BOOKER_SESSION = "booker_session"
      MANAGE_SESSION = "manage_session"
      SYSTEM = "system"
    end
  end
end
