# frozen_string_literal: true

module Coss
  module LogDrains
    class Client
      # @param client [Coss::Internal::Http::RawClient]
      #
      # @return [void]
      def initialize(client:)
        @client = client
      end

      # Every drain of the API key's environment, oldest first. Log drains belong to the API key's own environment: a
      # `coss_test_…` key only ever sees sandbox drains, and a `coss_live_…` key only production ones.
      #
      # @param request_options [Hash]
      # @param _params [Hash]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      #
      # @example
      #   client.log_drains.list
      #
      # @return [Coss::Types::LogDrainList]
      def list(request_options: {}, **_params)
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/log_drains",
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::LogDrainList.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Streams the environment's logs to a URL: every line `GET /v1/logs` returns (API requests, email events, webhook
      # attempts) and the environment's audit events, posted as signed batches of up to 500 lines or 1 MB, usually
      # within seconds. `format` picks the body: NDJSON for your own endpoint, or the intake API of Loki (Grafana
      # Cloud), Datadog or an OTLP/HTTP collector, with `auth_header` carrying its key. Log drains belong to the API
      # key's own environment: a `coss_test_…` key only ever sees sandbox drains, and a `coss_live_…` key only
      # production ones. The response carries the signing secret, which is returned only here: store it, and verify
      # every NDJSON batch with it (`verifyLogDrainBatch` in the SDK).
      #
      # @param request_options [Hash]
      # @param params [Coss::LogDrains::Types::CreateLogDrainRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      #
      # @example
      #   client.log_drains.create(
      #     url: "https://logs.example.com/coss",
      #     description: "Production logs",
      #     sources: %w[api email]
      #   )
      #
      # @return [Coss::Types::LogDrainWithSecret]
      def create(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/log_drains",
          headers: headers,
          body: Coss::LogDrains::Types::CreateLogDrainRequest.new(params).to_h,
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
          (response.body.to_s.empty? ? nil : Coss::Types::LogDrainWithSecret.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # The drain without its signing secret, which is only returned when created.
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
      #   client.log_drains.get(id: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz")
      #
      # @return [Coss::Types::LogDrain]
      def get(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/log_drains/#{URI.encode_uri_component(params[:id].to_s)}",
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::LogDrain.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Removes the drain and its batch log. Lines still waiting for it are dropped. To stop it temporarily, set
      # `enabled` to `false` instead.
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
      #   client.log_drains.delete(id: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz")
      #
      # @return [Coss::Types::DeletedLogDrain]
      def delete(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "DELETE",
          path: "v1/log_drains/#{URI.encode_uri_component(params[:id].to_s)}",
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::DeletedLogDrain.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Changes the URL, description, sources, format, auth header or `enabled` flag. Omitted fields keep their current
      # value (`auth_header: null` removes the header), and the signing secret stays the same. A batch being retried
      # goes out as the drain is when it is retried. Disabling a drain drops the lines still waiting for it, and nothing
      # is kept for it while it is disabled; enabling it again (also after coss.com disabled it for failing) sends lines
      # logged from then on.
      #
      # @param request_options [Hash]
      # @param params [Coss::LogDrains::Types::UpdateLogDrainRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String] :id
      #
      # @example
      #   client.log_drains.update(
      #     id: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz",
      #     enabled: false
      #   )
      #
      # @return [Coss::Types::LogDrain]
      def update(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request_data = Coss::LogDrains::Types::UpdateLogDrainRequest.new(params).to_h
        non_body_param_names = %w[id]
        body = request_data.except(*non_body_param_names)

        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "PATCH",
          path: "v1/log_drains/#{URI.encode_uri_component(params[:id].to_s)}",
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
          (response.body.to_s.empty? ? nil : Coss::Types::LogDrain.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # @return [Coss::Batches::Client]
      def batches
        @batches ||= Coss::LogDrains::Batches::Client.new(client: @client)
      end
    end
  end
end
