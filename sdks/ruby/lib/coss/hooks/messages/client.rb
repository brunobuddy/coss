# frozen_string_literal: true

module Coss
  module Hooks
    module Messages
      class Client
        # @param client [Coss::Internal::Http::RawClient]
        #
        # @return [void]
        def initialize(client:)
          @client = client
        end

        # The application's messages, newest first (kept for 30 days).
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :application
        # @option params [String, nil] :event_type
        # @option params [Integer, nil] :limit
        # @option params [String, nil] :after
        #
        # @example
        #   client.hooks.messages.list(application: "customer_8812")
        #
        # @return [Coss::Types::HookMessageList]
        def list(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          query_params = {}
          query_params["event_type"] = params[:event_type] if params.key?(:event_type)
          query_params["limit"] = params[:limit] if params.key?(:limit)
          query_params["after"] = params[:after] if params.key?(:after)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/hooks/applications/#{URI.encode_uri_component(params[:application].to_s)}/messages",
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
            (response.body.to_s.empty? ? nil : Coss::Types::HookMessageList.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Queues a message to the application: coss.com delivers it to each of its enabled endpoints subscribed to
        # `event_type` within seconds, signed with each endpoint's secret, and retries failures with backoff for about a
        # day. Each request's `webhook-id` header is the message's id. Counts against the send quota once per endpoint
        # it goes to (at least once). A live message is billed once, whatever its fan-out; retries and sandbox are free.
        # Live sends are refused while the organization is suspended (`account_suspended`), on a billing hold
        # (`billing_hold`), over a budget (`budget_exceeded`) or past Free's monthly messages (`usage_limit_exceeded`).
        # Hooks resources belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones, a
        # `coss_live_…` key only production ones.
        #
        # @param request_options [Hash]
        # @param params [Coss::Hooks::Messages::Types::SendHookMessageRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :application
        # @option params [String, nil] :idempotency_key
        #
        # @example
        #   client.hooks.messages.send_(
        #     application: "customer_8812",
        #     idempotency_key: "invoice-1042-paid",
        #     event_type: "invoice.paid",
        #     payload: {
        #       invoice_id: "in_1042",
        #       amount: 4200,
        #       currency: "usd"
        #     }
        #   )
        #
        # @return [Coss::Types::HookMessage]
        def send_(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request_data = Coss::Hooks::Messages::Types::SendHookMessageRequest.new(params).to_h
          non_body_param_names = %w[application Idempotency-Key]
          body = request_data.except(*non_body_param_names)

          headers = {}
          headers["Idempotency-Key"] = params[:idempotency_key] if params[:idempotency_key]

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/hooks/applications/#{URI.encode_uri_component(params[:application].to_s)}/messages",
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
            (response.body.to_s.empty? ? nil : Coss::Types::HookMessage.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # A message of the application, with its payload.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :application
        # @option params [String] :message_id
        #
        # @example
        #   client.hooks.messages.get(
        #     application: "customer_8812",
        #     message_id: "hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz"
        #   )
        #
        # @return [Coss::Types::HookMessage]
        def get(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/hooks/applications/#{URI.encode_uri_component(params[:application].to_s)}/messages/#{URI.encode_uri_component(params[:message_id].to_s)}",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::HookMessage.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # One delivery per endpoint the message went to.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :application
        # @option params [String] :message_id
        #
        # @example
        #   client.hooks.messages.list_deliveries(
        #     application: "customer_8812",
        #     message_id: "hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz"
        #   )
        #
        # @return [Coss::Types::HookDeliveryList]
        def list_deliveries(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/hooks/applications/#{URI.encode_uri_component(params[:application].to_s)}/messages/#{URI.encode_uri_component(params[:message_id].to_s)}/deliveries",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::HookDeliveryList.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end
      end
    end
  end
end
