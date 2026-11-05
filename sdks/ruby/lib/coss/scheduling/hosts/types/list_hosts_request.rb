# frozen_string_literal: true

module Coss
  module Scheduling
    module Hosts
      module Types
        class ListHostsRequest < Internal::Types::Model
          field :limit, -> { Integer }, optional: true, nullable: false

          field :after, -> { String }, optional: true, nullable: false
        end
      end
    end
  end
end
