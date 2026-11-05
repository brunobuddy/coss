# frozen_string_literal: true

module Coss
  module Types
    # Its own sending limits.
    class SubaccountQuotas < Internal::Types::Model
      field :recipients_per_day, -> { Integer }, optional: false, nullable: true

      field :recipients_per_second, -> { Integer }, optional: false, nullable: true

      field :burst, -> { Integer }, optional: false, nullable: true
    end
  end
end
