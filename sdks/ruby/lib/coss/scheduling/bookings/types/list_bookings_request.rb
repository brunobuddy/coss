# frozen_string_literal: true

module Coss
  module Scheduling
    module Bookings
      module Types
        class ListBookingsRequest < Internal::Types::Model
          field :limit, -> { Integer }, optional: true, nullable: false

          field :after, -> { String }, optional: true, nullable: false

          field :host, -> { String }, optional: true, nullable: false

          field :event_type, -> { String }, optional: true, nullable: false

          field :status, -> { Coss::Scheduling::Bookings::Types::ListBookingsRequestStatus }, optional: true, nullable: false

          field :attendee_uid, -> { String }, optional: true, nullable: false

          field :start_after, -> { String }, optional: true, nullable: false

          field :start_before, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
