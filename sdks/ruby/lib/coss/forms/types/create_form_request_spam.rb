# frozen_string_literal: true

module Coss
  module Forms
    module Types
      # How submissions are screened. Only the fields given change.
      class CreateFormRequestSpam < Internal::Types::Model
        field :honeypot_field, -> { String }, optional: true, nullable: false

        field :captcha, -> { Coss::Forms::Types::CreateFormRequestSpamCaptcha }, optional: true, nullable: false

        field :captcha_site_key, -> { String }, optional: true, nullable: false

        field :content_threshold, -> { Integer }, optional: true, nullable: false

        field :on_review, -> { Coss::Forms::Types::CreateFormRequestSpamOnReview }, optional: true, nullable: false
      end
    end
  end
end
