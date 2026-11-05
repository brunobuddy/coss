# frozen_string_literal: true

module Coss
  module Scheduling
    module Settings
      module Types
        # Your logo, a PNG or JPEG. `null` removes it.
        class UpdateSchedulingSettingsRequestLogo < Internal::Types::Model
          field :content, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
