# frozen_string_literal: true

module Coss
  module Scheduling
    module Sessions
      module Types
        # Who's booking, if you already know: the browser then can't change it.
        class CreateSchedulingBookerSessionRequestAttendee < Internal::Types::Model
          field :uid, -> { String }, optional: true, nullable: false

          field :name, -> { String }, optional: true, nullable: false

          field :email, -> { String }, optional: true, nullable: false

          field :phone, -> { String }, optional: true, nullable: false

          field :time_zone, -> { String }, optional: false, nullable: false

          field :locale, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
