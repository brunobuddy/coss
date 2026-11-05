# frozen_string_literal: true

module Coss
  module Types
    class SchedulingCalendarAuthorization < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingCalendarAuthorizationObject }, optional: false, nullable: false

      field :url, -> { String }, optional: false, nullable: false
    end
  end
end
