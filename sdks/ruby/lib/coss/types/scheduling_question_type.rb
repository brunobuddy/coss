# frozen_string_literal: true

module Coss
  module Types
    module SchedulingQuestionType
      extend Coss::Internal::Types::Enum

      TEXT = "text"
      TEXTAREA = "textarea"
      SELECT = "select"
      RADIO = "radio"
      CHECKBOX = "checkbox"
      PHONE = "phone"
      EMAIL = "email"
      NUMBER = "number"
    end
  end
end
