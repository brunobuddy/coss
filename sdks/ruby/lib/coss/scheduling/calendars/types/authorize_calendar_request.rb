# frozen_string_literal: true

module Coss
  module Scheduling
    module Calendars
      module Types
        class AuthorizeCalendarRequest < Internal::Types::Model
          field :host, -> { String }, optional: false, nullable: false

          field :provider, -> { Coss::Scheduling::Calendars::Types::AuthorizeCalendarRequestProvider }, optional: false, nullable: false

          field :return_url, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
