# frozen_string_literal: true

module Coss
  module Inboxes
    module Messages
      module Types
        # Who it's copied to.
        class SendInboxMessageRequestCc < Internal::Types::Model
          extend Coss::Internal::Types::Union

          member -> { String }

          member -> { Internal::Types::Array[String] }
        end
      end
    end
  end
end
