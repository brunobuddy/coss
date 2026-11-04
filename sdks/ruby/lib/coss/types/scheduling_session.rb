# frozen_string_literal: true

module Coss
  module Types
    class SchedulingSession < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingSessionObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :token, -> { String }, optional: false, nullable: false

      field :url, -> { String }, optional: false, nullable: true

      field :expires_at, -> { String }, optional: false, nullable: false
    end
  end
end
