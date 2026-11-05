# frozen_string_literal: true

module Coss
  module Types
    # What this event recorded, depending on its type.
    class SignEventDetails < Internal::Types::Model
      field :reason, -> { String }, optional: true, nullable: false

      field :document_sha256, -> { Internal::Types::Hash[String, String] }, optional: true, nullable: false

      field :disclosure_sha256, -> { String }, optional: true, nullable: false

      field :field_ids, -> { Internal::Types::Array[String] }, optional: true, nullable: false

      field :signature_sha256, -> { String }, optional: true, nullable: false

      field :initials_sha256, -> { String }, optional: true, nullable: false

      field :session_id, -> { String }, optional: true, nullable: false

      field :signed_document_sha256, -> { String }, optional: true, nullable: false
    end
  end
end
