# frozen_string_literal: true

module Coss
  module Types
    # At the top of the hosted pages, and of emails sent from `email_from`.
    class SchedulingSettingsLogo < Internal::Types::Model
      field :content_type, -> { Coss::Types::SchedulingSettingsLogoContentType }, optional: false, nullable: false

      field :width, -> { Integer }, optional: false, nullable: false

      field :height, -> { Integer }, optional: false, nullable: false

      field :data_url, -> { String }, optional: false, nullable: false
    end
  end
end
