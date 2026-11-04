# frozen_string_literal: true

module Coss
  module Logs
    class Client
      # @param client [Coss::Internal::Http::RawClient]
      #
      # @return [void]
      def initialize(client:)
        @client = client
      end

      # The API key's environment log, newest first: every API request made with one of its keys (`source: api`), every
      # email event (`email`) and every webhook delivery attempt (`webhook`). Filter by time range (an hour by default,
      # at most 31 days), source, level, type, status, method, route, key, request, resource or free text. Pass the last
      # `id` as `after` to get the next page while `has_more` is true. Reading logs is not itself logged.
      #
      # @param request_options [Hash]
      # @param params [Hash]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String, nil] :from
      # @option params [String, nil] :to
      # @option params [String, nil] :source
      # @option params [String, nil] :level
      # @option params [String, nil] :type
      # @option params [String, nil] :status
      # @option params [String, nil] :method_
      # @option params [String, nil] :route
      # @option params [String, nil] :api_key_id
      # @option params [String, nil] :request_id
      # @option params [String, nil] :resource_id
      # @option params [String, nil] :q
      # @option params [Integer, nil] :limit
      # @option params [String, nil] :after
      #
      # @example
      #   client.logs.list
      #
      # @return [Coss::Types::LogList]
      def list(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        query_params = {}
        query_params["from"] = params[:from] if params.key?(:from)
        query_params["to"] = params[:to] if params.key?(:to)
        query_params["source"] = params[:source] if params.key?(:source)
        query_params["level"] = params[:level] if params.key?(:level)
        query_params["type"] = params[:type] if params.key?(:type)
        query_params["status"] = params[:status] if params.key?(:status)
        query_params["method"] = params[:method_] if params.key?(:method_)
        query_params["route"] = params[:route] if params.key?(:route)
        query_params["api_key_id"] = params[:api_key_id] if params.key?(:api_key_id)
        query_params["request_id"] = params[:request_id] if params.key?(:request_id)
        query_params["resource_id"] = params[:resource_id] if params.key?(:resource_id)
        query_params["q"] = params[:q] if params.key?(:q)
        query_params["limit"] = params[:limit] if params.key?(:limit)
        query_params["after"] = params[:after] if params.key?(:after)

        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/logs",
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
          (response.body.to_s.empty? ? nil : Coss::Types::LogList.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # One line of the API key's environment log.
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
      #   client.logs.get(id: "log_01k7c8m4q2f3e9v6t5r1n0p8yz")
      #
      # @return [Coss::Types::Log]
      def get(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/logs/#{URI.encode_uri_component(params[:id].to_s)}",
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::Log.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end
    end
  end
end
