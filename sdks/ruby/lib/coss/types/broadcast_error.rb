# frozen_string_literal: true

module Coss
  module Types
    # Why it `failed`, such as `target_unavailable` when its audience, segment or topic was deleted while sending.
    # `null`: it didn't.
    class BroadcastError < Internal::Types::Model
      field :code, -> { String }, optional: false, nullable: false

      field :message, -> { String }, optional: false, nullable: false
    end
  end
end
