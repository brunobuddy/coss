# frozen_string_literal: true

module Coss
  module Types
    class SchedulingCalendarConnection < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingCalendarConnectionObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :host, -> { String }, optional: false, nullable: false

      field :provider, -> { Coss::Types::SchedulingCalendarConnectionProvider }, optional: false, nullable: false

      field :account, -> { String }, optional: false, nullable: false

      field :status, -> { Coss::Types::SchedulingCalendarConnectionStatus }, optional: false, nullable: false

      field :delegation, -> { String }, optional: false, nullable: true

      field :calendars, -> { Internal::Types::Array[Coss::Types::SchedulingCalendarConnectionCalendarsItem] }, optional: false, nullable: false

      field :created_at, -> { String }, optional: false, nullable: false
    end
  end
end
