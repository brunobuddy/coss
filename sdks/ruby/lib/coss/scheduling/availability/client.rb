# frozen_string_literal: true

module Coss
  module Scheduling
    module Availability
      class Client
        # @param client [Coss::Internal::Http::RawClient]
        #
        # @return [void]
        def initialize(client:)
          @client = client
        end

        # For "who's free" pages: each matching host's soonest slots, soonest first, across up to 500 hosts.
        #
        # @param request_options [Hash]
        # @param params [Coss::Scheduling::Availability::Types::AvailabilitySearchRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        #
        # @example
        #   client.scheduling.availability.search(
        #     event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     start: "2027-01-04T00:00:00.000Z",
        #     end_: "2027-01-18T00:00:00.000Z",
        #     attributes: {
        #       licensed_in: "CA"
        #     }
        #   )
        #
        # @return [Coss::Types::SchedulingAvailabilitySearchResult]
        def search(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/scheduling/availability/search",
            headers: headers,
            body: Coss::Scheduling::Availability::Types::AvailabilitySearchRequest.new(params).to_h,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingAvailabilitySearchResult.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end
      end
    end
  end
end
