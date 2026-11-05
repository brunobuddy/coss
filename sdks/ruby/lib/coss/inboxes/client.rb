# frozen_string_literal: true

module Coss
  module Inboxes
    class Client
      # @param client [Coss::Internal::Http::RawClient]
      #
      # @return [void]
      def initialize(client:)
        @client = client
      end

      # The environment's inboxes, newest first. Pass the last `id` as `after` to get the next page while `has_more` is
      # true.
      #
      # @param request_options [Hash]
      # @param params [Hash]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [Integer, nil] :limit
      # @option params [String, nil] :after
      #
      # @example
      #   client.inboxes.list
      #
      # @return [Coss::Types::InboxList]
      def list(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        query_params = {}
        query_params["limit"] = params[:limit] if params.key?(:limit)
        query_params["after"] = params[:after] if params.key?(:after)

        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/inboxes",
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
          (response.body.to_s.empty? ? nil : Coss::Types::InboxList.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Gives an agent (or anyone) its own email address in the API key's environment: `username@<the environment's
      # inbound domain>`, which needs no DNS setup, or an address at one of the environment's receiving domains
      # (`domain`). Mail to it is kept as threads, and each message that arrives sends an `inbox.message.received`
      # webhook. With a `client_id` that already has an inbox, that inbox is returned (200) instead of a new one.
      #
      # @param request_options [Hash]
      # @param params [Coss::Inboxes::Types::CreateInboxRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      #
      # @example
      #   client.inboxes.create(
      #     username: "support-agent",
      #     display_name: "Acme Support",
      #     client_id: "agent-42"
      #   )
      #
      # @return [Coss::Types::Inbox]
      def create(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/inboxes",
          headers: headers,
          body: Coss::Inboxes::Types::CreateInboxRequest.new(params).to_h,
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
          (response.body.to_s.empty? ? nil : Coss::Types::Inbox.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # One inbox of the API key's environment.
      #
      # @param request_options [Hash]
      # @param params [Hash]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String] :inbox_id
      #
      # @example
      #   client.inboxes.get(inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz")
      #
      # @return [Coss::Types::Inbox]
      def get(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/inboxes/#{URI.encode_uri_component(params[:inbox_id].to_s)}",
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::Inbox.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Deletes the inbox and its threads. The received emails and emails they held stay in the environment until their
      # retention ends, and mail to the address is still received by the environment (without a thread or
      # `inbox.message.received` webhook).
      #
      # @param request_options [Hash]
      # @param params [Hash]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String] :inbox_id
      #
      # @example
      #   client.inboxes.delete(inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz")
      #
      # @return [Coss::Types::DeletedInbox]
      def delete(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "DELETE",
          path: "v1/inboxes/#{URI.encode_uri_component(params[:inbox_id].to_s)}",
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::DeletedInbox.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Changes the name messages from the inbox are sent with. Its address never changes.
      #
      # @param request_options [Hash]
      # @param params [Coss::Inboxes::Types::UpdateInboxRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String] :inbox_id
      #
      # @example
      #   client.inboxes.update(
      #     inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
      #     display_name: "Acme Help"
      #   )
      #
      # @return [Coss::Types::Inbox]
      def update(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request_data = Coss::Inboxes::Types::UpdateInboxRequest.new(params).to_h
        non_body_param_names = %w[inbox_id]
        body = request_data.except(*non_body_param_names)

        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "PATCH",
          path: "v1/inboxes/#{URI.encode_uri_component(params[:inbox_id].to_s)}",
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
          (response.body.to_s.empty? ? nil : Coss::Types::Inbox.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # @return [Coss::Threads::Client]
      def threads
        @threads ||= Coss::Inboxes::Threads::Client.new(client: @client)
      end

      # @return [Coss::Messages::Client]
      def messages
        @messages ||= Coss::Inboxes::Messages::Client.new(client: @client)
      end
    end
  end
end
