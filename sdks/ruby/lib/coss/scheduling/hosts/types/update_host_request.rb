# frozen_string_literal: true

module Coss
  module Scheduling
    module Hosts
      module Types
        class UpdateHostRequest < Internal::Types::Model
          field :host, -> { String }, optional: false, nullable: false

          field :uid, -> { String }, optional: true, nullable: false

          field :name, -> { String }, optional: true, nullable: false

          field :email, -> { String }, optional: true, nullable: false

          field :phone, -> { String }, optional: true, nullable: false

          field :calendar_account, -> { String }, optional: true, nullable: false

          field :time_zone, -> { String }, optional: true, nullable: false

          field :locale, -> { String }, optional: true, nullable: false

          field :attributes, -> { Internal::Types::Hash[String, Coss::Scheduling::Hosts::Types::UpdateHostRequestAttributesValue] }, optional: true, nullable: false

          field :locations, -> { Internal::Types::Array[Coss::Types::SchedulingHostLocation] }, optional: true, nullable: false

          field :metadata, -> { Internal::Types::Hash[String, String] }, optional: true, nullable: false

          field :status, -> { Coss::Scheduling::Hosts::Types::UpdateHostRequestStatus }, optional: true, nullable: false
        end
      end
    end
  end
end
