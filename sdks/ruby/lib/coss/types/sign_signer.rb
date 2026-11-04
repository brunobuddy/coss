# frozen_string_literal: true

module Coss
  module Types
    # Someone asked to sign.
    class SignSigner < Internal::Types::Model
      field :object, -> { Coss::Types::SignSignerObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :name, -> { String }, optional: false, nullable: false

      field :email, -> { String }, optional: false, nullable: false

      field :order, -> { Integer }, optional: false, nullable: false

      field :delivery, -> { Coss::Types::SignSignerDelivery }, optional: false, nullable: false

      field :authentication, -> { Coss::Types::SignSignerAuthentication }, optional: false, nullable: false

      field :status, -> { Coss::Types::SignSignerStatus }, optional: false, nullable: false

      field :client_ref, -> { String }, optional: false, nullable: true

      field :viewed_at, -> { String }, optional: false, nullable: true

      field :signed_at, -> { String }, optional: false, nullable: true

      field :declined_at, -> { String }, optional: false, nullable: true

      field :decline_reason, -> { String }, optional: false, nullable: true
    end
  end
end
