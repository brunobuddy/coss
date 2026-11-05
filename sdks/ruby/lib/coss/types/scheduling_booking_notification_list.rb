# frozen_string_literal: true

module Coss
  module Types
    class SchedulingBookingNotificationList < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingBookingNotificationListObject }, optional: false, nullable: false

      field :data, -> { Internal::Types::Array[Coss::Types::SchedulingBookingNotification] }, optional: false, nullable: false

      field :has_more, -> { Internal::Types::Boolean }, optional: false, nullable: false
    end
  end
end
