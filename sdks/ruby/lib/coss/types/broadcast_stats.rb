# frozen_string_literal: true

module Coss
  module Types
    # How its emails fared so far.
    class BroadcastStats < Internal::Types::Model
      field :recipients, -> { Integer }, optional: false, nullable: false

      field :sent, -> { Integer }, optional: false, nullable: false

      field :delivered, -> { Integer }, optional: false, nullable: false

      field :bounced, -> { Integer }, optional: false, nullable: false

      field :complained, -> { Integer }, optional: false, nullable: false

      field :failed, -> { Integer }, optional: false, nullable: false

      field :opened, -> { Integer }, optional: false, nullable: false

      field :clicked, -> { Integer }, optional: false, nullable: false

      field :unsubscribed, -> { Integer }, optional: false, nullable: false
    end
  end
end
