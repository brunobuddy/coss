# frozen_string_literal: true

module Coss
  module Sms
    class Client
      # @param client [Coss::Internal::Http::RawClient]
      #
      # @return [void]
      def initialize(client:)
        @client = client
      end

      # Messages sent from the API key's environment, newest first. Pass the last `id` as `after` to get the next page
      # while `has_more` is true.
      #
      # @param request_options [Hash]
      # @param params [Hash]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String, nil] :to
      # @option params [String, nil] :status
      # @option params [String, nil] :created_after
      # @option params [String, nil] :created_before
      # @option params [Integer, nil] :limit
      # @option params [String, nil] :after
      #
      # @example
      #   client.sms.list
      #
      # @return [Coss::Types::SmsList]
      def list(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        query_params = {}
        query_params["to"] = params[:to] if params.key?(:to)
        query_params["status"] = params[:status] if params.key?(:status)
        query_params["created_after"] = params[:created_after] if params.key?(:created_after)
        query_params["created_before"] = params[:created_before] if params.key?(:created_before)
        query_params["limit"] = params[:limit] if params.key?(:limit)
        query_params["after"] = params[:after] if params.key?(:after)

        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/sms",
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
          (response.body.to_s.empty? ? nil : Coss::Types::SmsList.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Queues a text message from the API key's environment and returns it with `status: "queued"`; it is handed to the
      # carrier moments later. Follow it with `GET /v1/sms/{id}` or the `sms.sent`, `sms.delivered`, `sms.undelivered`
      # and `sms.failed` webhooks. Live (`coss_live_…`) keys send `from` one of the organization's numbers whose carrier
      # registration is approved, to the countries the organization allows (US and Canada unless changed in the
      # dashboard). Sandbox (`coss_test_…`) keys accept any `from`, deliver nothing and answer the SMS simulator's
      # numbers (`+15005550006` delivered, `+15005550001` invalid, `+15005550004` filtered by the carrier,
      # `+15005550009` opted out, `+15005550008` replies). A number on the environment's SMS suppression list (it
      # replied STOP, or it can't receive SMS) is skipped: the message is `failed` with `suppressed`. Segments count
      # against the organization's send quota, and each is billed by the destination country.
      #
      # @param request_options [Hash]
      # @param params [Coss::Sms::Types::SendSmsRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String, nil] :idempotency_key
      #
      # @example
      #   client.sms.send_(
      #     idempotency_key: "welcome-user-123",
      #     from: "+14155550123",
      #     to: "+14155550199",
      #     body: "Your Acme code is 482913",
      #     tags: [{
      #       name: "flow",
      #       value: "sign_in"
      #     }]
      #   )
      #
      # @return [Coss::Types::Sms]
      def send_(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request_data = Coss::Sms::Types::SendSmsRequest.new(params).to_h
        non_body_param_names = %w[Idempotency-Key]
        body = request_data.except(*non_body_param_names)

        headers = {}
        headers["Idempotency-Key"] = params[:idempotency_key] if params[:idempotency_key]

        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/sms",
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
          (response.body.to_s.empty? ? nil : Coss::Types::Sms.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # One message sent from the API key's environment, with its current status.
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
      #   client.sms.get(id: "sms_01k7c8m4q2f3e9v6t5r1n0p8yz")
      #
      # @return [Coss::Types::Sms]
      def get(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/sms/#{URI.encode_uri_component(params[:id].to_s)}",
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::Sms.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Everything that happened to the message, oldest first.
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
      #   client.sms.list_events(id: "sms_01k7c8m4q2f3e9v6t5r1n0p8yz")
      #
      # @return [Coss::Types::SmsEventList]
      def list_events(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/sms/#{URI.encode_uri_component(params[:id].to_s)}/events",
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::SmsEventList.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Cancels a message scheduled with `scheduled_at` before it is sent. Canceling a canceled message returns it as
      # is.
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
      #   client.sms.cancel(id: "sms_01k7c8m4q2f3e9v6t5r1n0p8yz")
      #
      # @return [Coss::Types::Sms]
      def cancel(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/sms/#{URI.encode_uri_component(params[:id].to_s)}/cancel",
          headers: headers,
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::Sms.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # @return [Coss::Suppressions::Client]
      def suppressions
        @suppressions ||= Coss::Sms::Suppressions::Client.new(client: @client)
      end

      # @return [Coss::Received::Client]
      def received
        @received ||= Coss::Sms::Received::Client.new(client: @client)
      end

      # @return [Coss::Numbers::Client]
      def numbers
        @numbers ||= Coss::Sms::Numbers::Client.new(client: @client)
      end
    end
  end
end
