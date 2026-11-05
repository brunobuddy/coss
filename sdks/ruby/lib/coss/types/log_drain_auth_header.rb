# frozen_string_literal: true

module Coss
  module Types
    # A header sent with every batch, for intake APIs that take a key: `Authorization` (`Basic …`, `Bearer …`),
    # `DD-API-KEY`… Its value is stored encrypted and never returned. `null` removes it.
    class LogDrainAuthHeader < Internal::Types::Model
      field :name, -> { String }, optional: false, nullable: false

      field :value, -> { String }, optional: false, nullable: false
    end
  end
end
