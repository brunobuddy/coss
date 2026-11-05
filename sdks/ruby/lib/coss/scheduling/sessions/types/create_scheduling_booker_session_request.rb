# frozen_string_literal: true

module Coss
  module Scheduling
    module Sessions
      module Types
        class CreateSchedulingBookerSessionRequest < Internal::Types::Model
          field :event_type, -> { String }, optional: false, nullable: false

          field :host, -> { String }, optional: true, nullable: false

          field :attributes, -> { Internal::Types::Hash[String, Coss::Scheduling::Sessions::Types::CreateSchedulingBookerSessionRequestAttributesValue] }, optional: true, nullable: false

          field :attendee, -> { Coss::Scheduling::Sessions::Types::CreateSchedulingBookerSessionRequestAttendee }, optional: true, nullable: false

          field :expires_in, -> { Integer }, optional: true, nullable: false
        end
      end
    end
  end
end
