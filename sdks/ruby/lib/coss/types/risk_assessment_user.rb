# frozen_string_literal: true

module Coss
  module Types
    # Who it's about.
    class RiskAssessmentUser < Internal::Types::Model
      field :id, -> { String }, optional: false, nullable: true

      field :email, -> { String }, optional: false, nullable: true
    end
  end
end
