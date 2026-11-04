# frozen_string_literal: true

module Coss
  module Scheduling
    module Hosts
      module Types
        class GetHostsRequest < Internal::Types::Model
          field :host, -> { String }, optional: false, nullable: false
        end
      end
    end
  end
end
