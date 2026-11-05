# frozen_string_literal: true

module Coss
  module Scheduling
    module Calendars
      class Client
        # @param client [Coss::Internal::Http::RawClient]
        #
        # @return [void]
        def initialize(client:)
          @client = client
        end

        # A URL for the host to give consent at Google or Microsoft. Open it in a new window: providers refuse to be
        # framed. Coss.com reads only busy times, and writes events with a neutral title unless the event type's
        # `host_calendar_details` is `full`.
        #
        # @param request_options [Hash]
        # @param params [Coss::Scheduling::Calendars::Types::AuthorizeCalendarRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        #
        # @example
        #   client.scheduling.calendars.authorize(
        #     host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     provider: "google"
        #   )
        #
        # @return [Coss::Types::SchedulingCalendarAuthorization]
        def authorize(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request_data = Coss::Scheduling::Calendars::Types::AuthorizeCalendarRequest.new(params).to_h
          non_body_param_names = %w[host]
          body = request_data.except(*non_body_param_names)

          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/calendar_connections/authorize",
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
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingCalendarAuthorization.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # With each connection's calendars and which of them count.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        #
        # @example
        #   client.scheduling.calendars.list(host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m")
        #
        # @return [Coss::Types::SchedulingCalendarConnectionList]
        def list(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/calendar_connections",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingCalendarConnectionList.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # CalDAV (Apple and others) with an app password, or, in sandbox environments, a `simulated` calendar whose busy
        # times you set yourself. Google and Microsoft use `authorize`.
        #
        # @param request_options [Hash]
        # @param params [Coss::Types::CreateCalendarConnectionRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        #
        # @example
        #   client.scheduling.calendars.connect(host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m")
        #
        # @return [Coss::Types::SchedulingCalendarConnection]
        def connect(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          path_param_names = %i[host]
          body_params = params.except(*path_param_names)

          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/calendar_connections",
            headers: headers,
            body: Coss::Types::CreateCalendarConnectionRequest.new(body_params).to_h,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingCalendarConnection.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Revokes coss.com's access and deletes every busy time read through it. One a calendar delegation manages is
        # refused (`calendar_managed`).
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        # @option params [String] :id
        #
        # @example
        #   client.scheduling.calendars.disconnect(
        #     host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     id: "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m"
        #   )
        #
        # @return [Coss::Types::DeletedSchedulingCalendarConnection]
        def disconnect(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "DELETE",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/calendar_connections/#{URI.encode_uri_component(params[:id].to_s)}",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::DeletedSchedulingCalendarConnection.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Whether its busy times block slots, and whether bookings are written to it.
        #
        # @param request_options [Hash]
        # @param params [Coss::Scheduling::Calendars::Types::UpdateCalendarRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        # @option params [String] :calendar_id
        #
        # @example
        #   client.scheduling.calendars.update(
        #     host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     calendar_id: "cal_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     read_busy: true
        #   )
        #
        # @return [Coss::Types::SchedulingCalendarConnectionList]
        def update(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request_data = Coss::Scheduling::Calendars::Types::UpdateCalendarRequest.new(params).to_h
          non_body_param_names = %w[host calendar_id]
          body = request_data.except(*non_body_param_names)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "PATCH",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/calendars/#{URI.encode_uri_component(params[:calendar_id].to_s)}",
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
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingCalendarConnectionList.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Sandbox environments only: test how bookings react to a busy calendar.
        #
        # @param request_options [Hash]
        # @param params [Coss::Scheduling::Calendars::Types::SetSimulatedBusyRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        #
        # @example
        #   client.scheduling.calendars.set_simulated_busy(
        #     host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     intervals: [{
        #       start: "2027-01-04T15:00:00.000Z",
        #       end_: "2027-01-04T16:00:00.000Z"
        #     }]
        #   )
        #
        # @return [untyped]
        def set_simulated_busy(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request_data = Coss::Scheduling::Calendars::Types::SetSimulatedBusyRequest.new(params).to_h
          non_body_param_names = %w[host]
          body = request_data.except(*non_body_param_names)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "PUT",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/simulated_busy",
            body: body,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          return response.body if code.between?(200, 299)

          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end
    end
  end
end
