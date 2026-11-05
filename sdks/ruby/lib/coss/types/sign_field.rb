# frozen_string_literal: true

module Coss
  module Types
    # A box on a page that one signer fills.
    class SignField < Internal::Types::Model
      field :object, -> { Coss::Types::SignFieldObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :signer_id, -> { String }, optional: false, nullable: false

      field :document_id, -> { String }, optional: false, nullable: false

      field :type, -> { Coss::Types::SignFieldType }, optional: false, nullable: false

      field :page, -> { Integer }, optional: false, nullable: false

      field :x, -> { Integer }, optional: false, nullable: false

      field :y, -> { Integer }, optional: false, nullable: false

      field :width, -> { Integer }, optional: false, nullable: false

      field :height, -> { Integer }, optional: false, nullable: false

      field :required, -> { Internal::Types::Boolean }, optional: false, nullable: false

      field :label, -> { String }, optional: false, nullable: true

      field :anchor, -> { String }, optional: false, nullable: true
    end
  end
end
