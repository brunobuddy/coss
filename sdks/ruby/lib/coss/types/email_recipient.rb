# frozen_string_literal: true

module Coss
  module Types
    # One recipient of an email and how delivery to them went.
    class EmailRecipient < Internal::Types::Model
      field :address, -> { String }, optional: false, nullable: false

      field :type, -> { Coss::Types::EmailRecipientType }, optional: false, nullable: false

      field :status, -> { Coss::Types::EmailRecipientStatus }, optional: false, nullable: false

      field :last_event_at, -> { String }, optional: false, nullable: true
    end
  end
end
