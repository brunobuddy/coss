# frozen_string_literal: true

module Coss
  module Types
    class CreateCalendarConnectionRequestCaldav < Internal::Types::Model
      field :url, -> { String }, optional: false, nullable: false

      field :username, -> { String }, optional: false, nullable: false

      field :password, -> { String }, optional: false, nullable: false
    end
  end
end
