# frozen_string_literal: true

module Coss
  module Types
    class SchedulingHost < Internal::Types::Model
      field :object, -> { Coss::Types::SchedulingHostObject }, optional: false, nullable: false

      field :id, -> { String }, optional: false, nullable: false

      field :uid, -> { String }, optional: false, nullable: true

      field :name, -> { String }, optional: false, nullable: false

      field :email, -> { String }, optional: false, nullable: true

      field :phone, -> { String }, optional: false, nullable: true

      field :calendar_account, -> { String }, optional: false, nullable: true

      field :time_zone, -> { String }, optional: false, nullable: false

      field :locale, -> { String }, optional: false, nullable: true

      field :attributes, -> { Internal::Types::Hash[String, Coss::Types::SchedulingHostAttributesValue] }, optional: false, nullable: false

      field :locations, -> { Internal::Types::Array[Coss::Types::SchedulingHostLocation] }, optional: false, nullable: false

      field :metadata, -> { Internal::Types::Hash[String, String] }, optional: false, nullable: false

      field :status, -> { Coss::Types::SchedulingHostStatus }, optional: false, nullable: false

      field :created_at, -> { String }, optional: false, nullable: false

      field :updated_at, -> { String }, optional: false, nullable: false
    end
  end
end
