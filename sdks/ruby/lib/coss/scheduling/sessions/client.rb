# frozen_string_literal: true

module Coss
  module Scheduling
    module Sessions
      class Client
        # @param client [Coss::Internal::Http::RawClient]
        #
        # @return [void]
        def initialize(client:)
          @client = client
        end

        # Lets one host manage their own hours, calendars and locations, on coss.com's hosted page or your own UI. Send
        # the `url` to their browser, or embed it with `coss/scheduling`.
        #
        # @param request_options [Hash]
        # @param params [Coss::Scheduling::Sessions::Types::CreateSchedulingHostSessionRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        #
        # @example
        #   client.scheduling.sessions.create_for_host(
        #     host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     expires_in: 3600
        #   )
        #
        # @return [Coss::Types::SchedulingSession]
        def create_for_host(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request_data = Coss::Scheduling::Sessions::Types::CreateSchedulingHostSessionRequest.new(params).to_h
          non_body_param_names = %w[host]
          body = request_data.except(*non_body_param_names)

          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/sessions",
            headers: headers,
            body: body,
            request_options: request_options,
            max_retries: 0
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingSession.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Lets a browser book one event type, on coss.com's hosted page or your own UI, without your API key.
        #
        # @param request_options [Hash]
        # @param params [Coss::Scheduling::Sessions::Types::CreateSchedulingBookerSessionRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        #
        # @example
        #   client.scheduling.sessions.create_for_booker(
        #     event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     attendee: {
        #       uid: "patient_77",
        #       name: "Sam Lee",
        #       time_zone: "UTC"
        #     }
        #   )
        #
        # @return [Coss::Types::SchedulingSession]
        def create_for_booker(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/scheduling/booker_sessions",
            headers: headers,
            body: Coss::Scheduling::Sessions::Types::CreateSchedulingBookerSessionRequest.new(params).to_h,
            request_options: request_options,
            max_retries: 0
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingSession.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Lets an attendee reschedule or cancel this one booking, within the event type's cutoffs. Stops working when
        # the booking's cancelled, or a day after it ends.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :id
        #
        # @example
        #   client.scheduling.sessions.create_for_booking(id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m")
        #
        # @return [Coss::Types::SchedulingSession]
        def create_for_booking(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/scheduling/bookings/#{URI.encode_uri_component(params[:id].to_s)}/manage_sessions",
            headers: headers,
            request_options: request_options,
            max_retries: 0
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingSession.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end
      end
    end
  end
end
