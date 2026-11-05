# frozen_string_literal: true

module Coss
  module Types
    class SchedulingBookingAttendeesItem < Internal::Types::Model
      field :id, -> { String }, optional: false, nullable: false

      field :role, -> { Coss::Types::SchedulingBookingAttendeesItemRole }, optional: false, nullable: false

      field :uid, -> { String }, optional: false, nullable: true

      field :name, -> { String }, optional: false, nullable: true

      field :email, -> { String }, optional: false, nullable: true

      field :phone, -> { String }, optional: false, nullable: true

      field :time_zone, -> { String }, optional: false, nullable: false

      field :locale, -> { String }, optional: false, nullable: true

      field :answers, -> { Internal::Types::Hash[String, Coss::Types::SchedulingBookingAttendeesItemAnswersValue] }, optional: true, nullable: false
    end
  end
end
