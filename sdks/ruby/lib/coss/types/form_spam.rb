# frozen_string_literal: true

module Coss
  module Types
    # How submissions are screened.
    class FormSpam < Internal::Types::Model
      field :honeypot_field, -> { String }, optional: false, nullable: false

      field :captcha, -> { Coss::Types::FormSpamCaptcha }, optional: false, nullable: false

      field :captcha_site_key, -> { String }, optional: false, nullable: true

      field :content_threshold, -> { Integer }, optional: false, nullable: true

      field :on_review, -> { Coss::Types::FormSpamOnReview }, optional: false, nullable: false
    end
  end
end
