# frozen_string_literal: true

module Coss
  module Types
    # What the address says. `null` on an assessment with no IP.
    class RiskIPSignals < Internal::Types::Model
      field :version, -> { Integer }, optional: false, nullable: false

      field :private, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :tor, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :hosting, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :hosting_provider, -> { String }, optional: false, nullable: true

      field :hosting_kind, -> { Coss::Types::RiskIPSignalsHostingKind }, optional: false, nullable: true

      field :asn, -> { Integer }, optional: false, nullable: true

      field :as_name, -> { String }, optional: false, nullable: true

      field :country, -> { String }, optional: false, nullable: true

      field :privacy, -> { Coss::Types::RiskIPPrivacy }, optional: false, nullable: true
    end
  end
end
