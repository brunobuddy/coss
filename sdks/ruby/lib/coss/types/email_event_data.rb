# frozen_string_literal: true

module Coss
  module Types
    # Details of the event: only what its `type` has.
    class EmailEventData < Internal::Types::Model
      field :bounce, -> { Coss::Types::EmailEventDataBounce }, optional: true, nullable: false

      field :complaint, -> { Coss::Types::EmailEventDataComplaint }, optional: true, nullable: false

      field :delay, -> { Coss::Types::EmailEventDataDelay }, optional: true, nullable: false

      field :delivery, -> { Coss::Types::EmailEventDataDelivery }, optional: true, nullable: false

      field :failure, -> { Coss::Types::EmailEventDataFailure }, optional: true, nullable: false

      field :suppression, -> { Coss::Types::EmailEventDataSuppression }, optional: true, nullable: false

      field :unsubscribe, -> { Coss::Types::EmailEventDataUnsubscribe }, optional: true, nullable: false

      field :open, -> { Coss::Types::EmailEventDataOpen }, optional: true, nullable: false

      field :click, -> { Coss::Types::EmailEventDataClick }, optional: true, nullable: false

      field :reschedule, -> { Coss::Types::EmailEventDataReschedule }, optional: true, nullable: false
    end
  end
end
