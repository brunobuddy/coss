# frozen_string_literal: true

module Coss
  module AuditEvents
    class Client
      # @param client [Coss::Internal::Http::RawClient]
      #
      # @return [void]
      def initialize(client:)
        @client = client
      end

      # The organization's audit log, newest first: changes made by members in the dashboard, by API keys (from any
      # environment) and by coss.com support. The audit log is organization-wide, so every key of the organization reads
      # the same events. Filter by action (an entry ending in `.` matches a whole resource, e.g. `domain.`), actor,
      # target, environment or time. Pass the last `id` as `after` to get the next page while `has_more` is true.
      # Reading the audit log is not itself logged.
      #
      # @param request_options [Hash]
      # @param params [Hash]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String, nil] :action
      # @option params [String, nil] :actor_type
      # @option params [String, nil] :actor_id
      # @option params [String, nil] :target_id
      # @option params [String, nil] :environment_id
      # @option params [String, nil] :from
      # @option params [String, nil] :to
      # @option params [Integer, nil] :limit
      # @option params [String, nil] :after
      #
      # @example
      #   client.audit_events.list
      #
      # @return [Coss::Types::AuditEventList]
      def list(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        query_params = {}
        query_params["action"] = params[:action] if params.key?(:action)
        query_params["actor_type"] = params[:actor_type] if params.key?(:actor_type)
        query_params["actor_id"] = params[:actor_id] if params.key?(:actor_id)
        query_params["target_id"] = params[:target_id] if params.key?(:target_id)
        query_params["environment_id"] = params[:environment_id] if params.key?(:environment_id)
        query_params["from"] = params[:from] if params.key?(:from)
        query_params["to"] = params[:to] if params.key?(:to)
        query_params["limit"] = params[:limit] if params.key?(:limit)
        query_params["after"] = params[:after] if params.key?(:after)

        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/audit_events",
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
          (response.body.to_s.empty? ? nil : Coss::Types::AuditEventList.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # One event of the organization's audit log.
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
      #   client.audit_events.get(id: "oaudit_01k7c8m4q2f3e9v6t5r1n0p8yz")
      #
      # @return [Coss::Types::AuditEvent]
      def get(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/audit_events/#{URI.encode_uri_component(params[:id].to_s)}",
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::AuditEvent.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end
    end
  end
end
