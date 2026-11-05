# frozen_string_literal: true

module Coss
  module Scheduling
    module Sessions
      module Types
        class CreateSchedulingHostSessionRequest < Internal::Types::Model
          field :host, -> { String }, optional: false, nullable: false

          field :expires_in, -> { Integer }, optional: true, nullable: false

          field :read_only, -> { Internal::Types::Boolean }, optional: true, nullable: false
        end
      end
    end
  end
end
