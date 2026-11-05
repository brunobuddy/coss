# frozen_string_literal: true

module Coss
  module Scheduling
    module Series
      class Client
        # @param client [Coss::Internal::Http::RawClient]
        #
        # @return [void]
        def initialize(client:)
          @client = client
        end

        # Books up to 52 occurrences, keeping the attendee's local time across DST changes. Each one is an ordinary
        # booking that can move on its own, and a pool keeps one host throughout.
        #
        # @param request_options [Hash]
        # @param params [Coss::Types::CreateSeriesRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String, nil] :idempotency_key
        #
        # @example
        #   client.scheduling.series.create(
        #     idempotency_key: "welcome-user-123",
        #     event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     start: "2027-01-04T15:00:00.000Z",
        #     attendee: {
        #       uid: "patient_77",
        #       time_zone: "America/New_York"
        #     },
        #     recurrence: {
        #       frequency: "weekly",
        #       interval: 1,
        #       count: 12
        #     }
        #   )
        #
        # @return [Coss::Types::SchedulingSeries]
        def create(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          headers = {}
          headers["Idempotency-Key"] = params[:idempotency_key] if params[:idempotency_key]
          params = params.except(:idempotency_key)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/scheduling/series",
            headers: headers,
            body: Coss::Types::CreateSeriesRequest.new(params).to_h,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingSeries.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Which occurrences would be free, without booking anything.
        #
        # @param request_options [Hash]
        # @param params [Coss::Types::CreateSeriesRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        #
        # @example
        #   client.scheduling.series.preview(
        #     event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     start: "2027-01-04T15:00:00.000Z",
        #     attendee: {
        #       uid: "patient_77",
        #       time_zone: "America/New_York"
        #     },
        #     recurrence: {
        #       frequency: "weekly",
        #       interval: 1,
        #       count: 12
        #     }
        #   )
        #
        # @return [Coss::Types::SchedulingSeriesPreview]
        def preview(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/scheduling/series/preview",
            headers: headers,
            body: Coss::Types::CreateSeriesRequest.new(params).to_h,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingSeriesPreview.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Cancels the occurrences from `from_index` on, or all of them.
        #
        # @param request_options [Hash]
        # @param params [Coss::Scheduling::Series::Types::CancelSeriesRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :id
        #
        # @example
        #   client.scheduling.series.cancel(
        #     id: "series_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     from_index: 4
        #   )
        #
        # @return [Coss::Types::SchedulingCancelledSeries]
        def cancel(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request_data = Coss::Scheduling::Series::Types::CancelSeriesRequest.new(params).to_h
          non_body_param_names = %w[id]
          body = request_data.except(*non_body_param_names)

          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/scheduling/series/#{URI.encode_uri_component(params[:id].to_s)}/cancel",
            headers: headers,
            body: body,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingCancelledSeries.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end
      end
    end
  end
end
