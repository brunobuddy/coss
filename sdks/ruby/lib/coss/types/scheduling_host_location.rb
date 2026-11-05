# frozen_string_literal: true

module Coss
  module Types
    # Where this host meets. A host has at most one of each type.
    class SchedulingHostLocation < Internal::Types::Model
      extend Coss::Internal::Types::Union

      discriminant :type

      member -> { Coss::Types::SchedulingHostLocationLink }, key: "LINK"

      member -> { Coss::Types::SchedulingHostLocationPhone }, key: "PHONE"

      member -> { Coss::Types::SchedulingHostLocationInPerson }, key: "IN_PERSON"
    end
  end
end
