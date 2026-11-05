# frozen_string_literal: true

module Coss
  module Types
    # Its own sending standing.
    class SubaccountReputation < Internal::Types::Model
      field :status, -> { Coss::Types::SubaccountReputationStatus }, optional: false, nullable: false

      field :trigger, -> { String }, optional: false, nullable: true

      field :changed_at, -> { String }, optional: false, nullable: true

      field :reinstated_at, -> { String }, optional: false, nullable: true
    end
  end
end
