# frozen_string_literal: true

module Coss
  module Email
    module Suppressions
      class Client
        # @param client [Coss::Internal::Http::RawClient]
        #
        # @return [void]
        def initialize(client:)
          @client = client
        end

        # The suppression list of the API key's environment, newest first. Pass the last `id` as `after` to get the next
        # page while `has_more` is true.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String, nil] :subaccount
        # @option params [String, nil] :address
        # @option params [Coss::Types::ListSuppressionsRequestScope, nil] :scope
        # @option params [Integer, nil] :limit
        # @option params [String, nil] :after
        #
        # @example
        #   client.email.suppressions.list(subaccount: "user_8812")
        #
        # @return [Coss::Types::SuppressionList]
        def list(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          query_params = {}
          query_params["subaccount"] = params[:subaccount] if params.key?(:subaccount)
          query_params["address"] = params[:address] if params.key?(:address)
          query_params["scope"] = params[:scope] if params.key?(:scope)
          query_params["limit"] = params[:limit] if params.key?(:limit)
          query_params["after"] = params[:after] if params.key?(:after)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/suppressions",
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
            (response.body.to_s.empty? ? nil : Coss::Types::SuppressionList.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Suppresses an address in the API key's environment: later sends skip it, either for every email (`scope: "*"`,
        # the default) or only for emails with the given `category` (e.g. to back an unsubscribe link). Adding an
        # address that is already suppressed with the same scope returns the existing entry with status 200.
        #
        # @param request_options [Hash]
        # @param params [Coss::Email::Suppressions::Types::CreateSuppressionRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        #
        # @example
        #   client.email.suppressions.add(
        #     address: "user@example.com",
        #     scope: "marketing"
        #   )
        #
        # @return [Coss::Types::Suppression]
        def add(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/suppressions",
            headers: headers,
            body: Coss::Email::Suppressions::Types::CreateSuppressionRequest.new(params).to_h,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::Suppression.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Whether a send to `address` (with `category`, if given) would skip it, and the entries that match: those with
        # scope `*` and, with a `category`, those for that category.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :address
        # @option params [String, nil] :category
        # @option params [Coss::Email::Suppressions::Types::CheckSuppressionsRequestStream, nil] :stream
        # @option params [String, nil] :subaccount
        #
        # @example
        #   client.email.suppressions.check(address: "user@example.com")
        #
        # @return [Coss::Types::SuppressionCheck]
        def check(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          query_params = {}
          query_params["address"] = params[:address] if params.key?(:address)
          query_params["category"] = params[:category] if params.key?(:category)
          query_params["stream"] = params[:stream] if params.key?(:stream)
          query_params["subaccount"] = params[:subaccount] if params.key?(:subaccount)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/suppressions/check",
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
            (response.body.to_s.empty? ? nil : Coss::Types::SuppressionCheck.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Adds up to 1000 entries at once, with reason `import`. Each entry is validated on its own: invalid ones are
        # skipped and listed in `invalid`, entries already on the list are left unchanged and counted in `existing`.
        # Importing again is safe.
        #
        # @param request_options [Hash]
        # @param params [Coss::Email::Suppressions::Types::ImportSuppressionsRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        #
        # @example
        #   client.email.suppressions.import(suppressions: [{
        #     address: "user@example.com"
        #   }, {
        #     address: "other@example.com",
        #     scope: "marketing"
        #   }])
        #
        # @return [Coss::Types::SuppressionImport]
        def import(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/suppressions/import",
            headers: headers,
            body: Coss::Email::Suppressions::Types::ImportSuppressionsRequest.new(params).to_h,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SuppressionImport.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # The whole suppression list of the API key's environment (optionally filtered), oldest first, as CSV with the
        # columns `address,scope,reason,created_at,email_id,id`. The file can be imported again as is. Values a
        # spreadsheet would run as a formula are prefixed with `'`.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String, nil] :subaccount
        # @option params [Coss::Types::ExportSuppressionsRequestScope, nil] :scope
        # @option params [Coss::Email::Suppressions::Types::ExportSuppressionsRequestReason, nil] :reason
        #
        # @example
        #   client.email.suppressions.export
        #
        # @return [String]
        def export(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          query_params = {}
          query_params["subaccount"] = params[:subaccount] if params.key?(:subaccount)
          query_params["scope"] = params[:scope] if params.key?(:scope)
          query_params["reason"] = params[:reason] if params.key?(:reason)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/suppressions/export",
            query: query_params,
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

        # One entry of the suppression list of the API key's environment.
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
        #   client.email.suppressions.get(id: "sup_01k7c8m4q2f3e9v6t5r1n0p8yz")
        #
        # @return [Coss::Types::Suppression]
        def get(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/suppressions/#{URI.encode_uri_component(params[:id].to_s)}",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::Suppression.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Removes the entry, so later sends reach the address again (unless another entry still matches). Entries added
        # for bounces and complaints can be removed too.
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
        #   client.email.suppressions.remove(id: "sup_01k7c8m4q2f3e9v6t5r1n0p8yz")
        #
        # @return [Coss::Types::DeletedSuppression]
        def remove(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "DELETE",
            path: "v1/suppressions/#{URI.encode_uri_component(params[:id].to_s)}",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::DeletedSuppression.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end
      end
    end
  end
end
