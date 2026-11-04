# frozen_string_literal: true

module Coss
  module Sign
    module Templates
      class Client
        # @param client [Coss::Internal::Http::RawClient]
        #
        # @return [void]
        def initialize(client:)
          @client = client
        end

        # Newest first. Pass the last `id` as `after` while `has_more` is true.
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
        #   client.sign.templates.list
        #
        # @return [Coss::Types::SignTemplateList]
        def list(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          query_params = {}
          query_params["limit"] = params[:limit] if params.key?(:limit)
          query_params["after"] = params[:after] if params.key?(:after)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/sign/templates",
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
            (response.body.to_s.empty? ? nil : Coss::Types::SignTemplateList.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Documents with fields for roles (`client`, `company`) instead of named signers, made into requests by naming a
        # signer per role. Fields by position or text anchor (resolved now). Can start empty and be built in the
        # embedded builder (create a builder session).
        #
        # @param request_options [Hash]
        # @param params [Coss::Sign::Templates::Types::CreateSignTemplateRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        #
        # @example
        #   client.sign.templates.create(
        #     name: "Mutual NDA",
        #     documents: [{
        #       document_id: "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz"
        #     }],
        #     roles: [{
        #       key: "client",
        #       name: "Client"
        #     }, {
        #       key: "company",
        #       name: "Company"
        #     }],
        #     fields: [{
        #       type: "signature",
        #       anchor: "{{signature:client}}",
        #       role: "client",
        #       page: 1,
        #       x: 1.1,
        #       y: 1.1,
        #       width: 1.1,
        #       height: 1.1
        #     }, {
        #       type: "text",
        #       page: 1,
        #       x: 72,
        #       y: 140,
        #       width: 200,
        #       height: 18,
        #       role: "client",
        #       merge_key: "client_company"
        #     }, {
        #       type: "signature",
        #       anchor: "{{signature:company}}",
        #       role: "company",
        #       page: 1,
        #       x: 1.1,
        #       y: 1.1,
        #       width: 1.1,
        #       height: 1.1
        #     }]
        #   )
        #
        # @return [Coss::Types::SignTemplate]
        def create(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/sign/templates",
            headers: headers,
            body: Coss::Sign::Templates::Types::CreateSignTemplateRequest.new(params).to_h,
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
            (response.body.to_s.empty? ? nil : Coss::Types::SignTemplate.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # A template with its documents, roles and fields. `ready` says whether requests can be made from it.
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
        #   client.sign.templates.get(id: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz")
        #
        # @return [Coss::Types::SignTemplate]
        def get(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/sign/templates/#{URI.encode_uri_component(params[:id].to_s)}",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SignTemplate.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Requests made from it, and its documents, stay.
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
        #   client.sign.templates.remove(id: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz")
        #
        # @return [Coss::Types::DeletedSignTemplate]
        def remove(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "DELETE",
            path: "v1/sign/templates/#{URI.encode_uri_component(params[:id].to_s)}",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::DeletedSignTemplate.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Changes the fields given. `documents`, `roles` and `fields` each replace the whole list. Requests already made
        # from it don't change.
        #
        # @param request_options [Hash]
        # @param params [Coss::Sign::Templates::Types::UpdateSignTemplateRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :id
        #
        # @example
        #   client.sign.templates.update(
        #     id: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
        #     name: "Mutual NDA (2026)"
        #   )
        #
        # @return [Coss::Types::SignTemplate]
        def update(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request_data = Coss::Sign::Templates::Types::UpdateSignTemplateRequest.new(params).to_h
          non_body_param_names = %w[id]
          body = request_data.except(*non_body_param_names)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "PATCH",
            path: "v1/sign/templates/#{URI.encode_uri_component(params[:id].to_s)}",
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
            (response.body.to_s.empty? ? nil : Coss::Types::SignTemplate.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # A signature request with the template's documents and fields: name one signer for each role, and give its
        # merge fields' values. Like creating a request, it is sent at once unless `send` is `false`, and an
        # `Idempotency-Key` makes retries safe.
        #
        # @param request_options [Hash]
        # @param params [Coss::Sign::Templates::Types::CreateSignRequestFromTemplateRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :id
        # @option params [String, nil] :idempotency_key
        #
        # @example
        #   client.sign.templates.create_request(
        #     id: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
        #     idempotency_key: "welcome-user-123",
        #     signers: [{
        #       role: "client",
        #       name: "Ada Lovelace",
        #       email: "ada@example.com"
        #     }, {
        #       role: "company",
        #       name: "Grace Hopper",
        #       email: "grace@acme.com",
        #       delivery: "embedded"
        #     }],
        #     merge_fields: {
        #       client_company: "Analytical Engines Ltd"
        #     }
        #   )
        #
        # @return [Coss::Types::SignRequest]
        def create_request(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request_data = Coss::Sign::Templates::Types::CreateSignRequestFromTemplateRequest.new(params).to_h
          non_body_param_names = %w[id Idempotency-Key]
          body = request_data.except(*non_body_param_names)

          headers = {}
          headers["Idempotency-Key"] = params[:idempotency_key] if params[:idempotency_key]

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/sign/templates/#{URI.encode_uri_component(params[:id].to_s)}/requests",
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
            (response.body.to_s.empty? ? nil : Coss::Types::SignRequest.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # A short-lived link to the embedded builder for this template: upload documents, add roles, and drag fields
        # onto pages. Embed it with `mountBuilder` from `coss/sign` (from an origin in your Sign settings'
        # `allowed_origins`) for whoever edits the template.
        #
        # @param request_options [Hash]
        # @param params [Coss::Sign::Templates::Types::CreateSignBuilderSessionRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :id
        #
        # @example
        #   client.sign.templates.create_builder_session(
        #     id: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
        #     expires_in: 3600
        #   )
        #
        # @return [Coss::Types::SignBuilderSession]
        def create_builder_session(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request_data = Coss::Sign::Templates::Types::CreateSignBuilderSessionRequest.new(params).to_h
          non_body_param_names = %w[id]
          body = request_data.except(*non_body_param_names)

          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/sign/templates/#{URI.encode_uri_component(params[:id].to_s)}/builder_sessions",
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
            (response.body.to_s.empty? ? nil : Coss::Types::SignBuilderSession.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end
      end
    end
  end
end
