# frozen_string_literal: true

module Coss
  module Scheduling
    module Slots
      class Client
        # @param client [Coss::Internal::Http::RawClient]
        #
        # @return [void]
        def initialize(client:)
          @client = client
        end

        # Starts an attendee can book between `start` and `end` (at most 62 days), as UTC instants to show in their own
        # time zone. A host whose calendar can't be read isn't offered.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :event_type
        # @option params [String] :start
        # @option params [String] :end_
        # @option params [String, nil] :host
        # @option params [Integer, nil] :duration_minutes
        # @option params [String, nil] :attributes
        #
        # @example
        #   client.scheduling.slots.list(
        #     event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     start: "2027-01-04T15:00:00.000Z",
        #     end_: "2027-01-04T15:00:00.000Z"
        #   )
        #
        # @return [Coss::Types::SchedulingSlotList]
        def list(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          query_params = {}
          query_params["start"] = params[:start] if params.key?(:start)
          query_params["end"] = params[:end_] if params.key?(:end_)
          query_params["host"] = params[:host] if params.key?(:host)
          query_params["duration_minutes"] = params[:duration_minutes] if params.key?(:duration_minutes)
          query_params["attributes"] = params[:attributes] if params.key?(:attributes)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/scheduling/event_types/#{URI.encode_uri_component(params[:event_type].to_s)}/slots",
            query: query_params,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingSlotList.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Why one start can or can't be booked right now, host by host, decided the same way a booking is. For support
        # and debugging: it says when a host is busy, so don't show it to attendees.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :event_type
        # @option params [String] :start
        # @option params [String, nil] :host
        # @option params [Integer, nil] :duration_minutes
        # @option params [String, nil] :attributes
        #
        # @example
        #   client.scheduling.slots.explain(
        #     event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     start: "2027-01-04T15:00:00.000Z"
        #   )
        #
        # @return [Coss::Types::SchedulingSlotExplanation]
        def explain(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          query_params = {}
          query_params["start"] = params[:start] if params.key?(:start)
          query_params["host"] = params[:host] if params.key?(:host)
          query_params["duration_minutes"] = params[:duration_minutes] if params.key?(:duration_minutes)
          query_params["attributes"] = params[:attributes] if params.key?(:attributes)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/scheduling/event_types/#{URI.encode_uri_component(params[:event_type].to_s)}/slots/explain",
            query: query_params,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingSlotExplanation.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end
      end
    end
  end
end
