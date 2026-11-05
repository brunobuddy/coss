# frozen_string_literal: true

module Coss
  module Email
    module Contacts
      module Properties
        class Client
          # @param client [Coss::Internal::Http::RawClient]
          #
          # @return [void]
          def initialize(client:)
            @client = client
          end

          # Every custom contact property of the API key's environment (at most 50), by key.
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
          #   client.email.contacts.properties.list
          #
          # @return [Coss::Types::ContactPropertyList]
          def list(request_options: {}, **_params)
            request = Coss::Internal::JSON::Request.new(
              base_url: request_options[:base_url],
              method: "GET",
              path: "v1/contact_properties",
              request_options: request_options
            )
            begin
              response = @client.send(request)
            rescue Net::HTTPRequestTimeout
              raise Coss::Errors::TimeoutError
            end
            code = response.code.to_i
            if code.between?(200, 299)
              (response.body.to_s.empty? ? nil : Coss::Types::ContactPropertyList.load(response.body))
            else
              error_class = Coss::Errors::ResponseError.subclass_for_code(code)
              raise error_class.new(response.body, code: code)
            end
          end

          # Defines a custom property contacts can have. Its key and type can't change; `fallback` is what templates use
          # for contacts without a value.
          #
          # @param request_options [Hash]
          # @param params [Coss::Email::Contacts::Properties::Types::CreateContactPropertyRequest]
          # @option request_options [String] :base_url
          # @option request_options [Hash{String => Object}] :additional_headers
          # @option request_options [Hash{String => Object}] :additional_query_parameters
          # @option request_options [Hash{String => Object}] :additional_body_parameters
          # @option request_options [Integer] :timeout_in_seconds
          #
          # @example
          #   client.email.contacts.properties.create(
          #     key: "plan",
          #     type: "string",
          #     fallback: "free"
          #   )
          #
          # @return [Coss::Types::ContactProperty]
          def create(request_options: {}, **params)
            params = Coss::Internal::Types::Utils.normalize_keys(params)
            headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
            request = Coss::Internal::JSON::Request.new(
              base_url: request_options[:base_url],
              method: "POST",
              path: "v1/contact_properties",
              headers: headers,
              body: Coss::Email::Contacts::Properties::Types::CreateContactPropertyRequest.new(params).to_h,
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
              (response.body.to_s.empty? ? nil : Coss::Types::ContactProperty.load(response.body))
            else
              error_class = Coss::Errors::ResponseError.subclass_for_code(code)
              raise error_class.new(response.body, code: code)
            end
          end

          # One contact property of the API key's environment: its key, type and fallback.
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
          #   client.email.contacts.properties.get(id: "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz")
          #
          # @return [Coss::Types::ContactProperty]
          def get(request_options: {}, **params)
            params = Coss::Internal::Types::Utils.normalize_keys(params)
            request = Coss::Internal::JSON::Request.new(
              base_url: request_options[:base_url],
              method: "GET",
              path: "v1/contact_properties/#{URI.encode_uri_component(params[:id].to_s)}",
              request_options: request_options
            )
            begin
              response = @client.send(request)
            rescue Net::HTTPRequestTimeout
              raise Coss::Errors::TimeoutError
            end
            code = response.code.to_i
            if code.between?(200, 299)
              (response.body.to_s.empty? ? nil : Coss::Types::ContactProperty.load(response.body))
            else
              error_class = Coss::Errors::ResponseError.subclass_for_code(code)
              raise error_class.new(response.body, code: code)
            end
          end

          # Deletes the property and removes its values from every contact. Refused while a segment filters on it
          # (`property_in_use`).
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
          #   client.email.contacts.properties.remove(id: "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz")
          #
          # @return [Coss::Types::DeletedContactProperty]
          def remove(request_options: {}, **params)
            params = Coss::Internal::Types::Utils.normalize_keys(params)
            request = Coss::Internal::JSON::Request.new(
              base_url: request_options[:base_url],
              method: "DELETE",
              path: "v1/contact_properties/#{URI.encode_uri_component(params[:id].to_s)}",
              request_options: request_options
            )
            begin
              response = @client.send(request)
            rescue Net::HTTPRequestTimeout
              raise Coss::Errors::TimeoutError
            end
            code = response.code.to_i
            if code.between?(200, 299)
              (response.body.to_s.empty? ? nil : Coss::Types::DeletedContactProperty.load(response.body))
            else
              error_class = Coss::Errors::ResponseError.subclass_for_code(code)
              raise error_class.new(response.body, code: code)
            end
          end

          # Changes the value used when a contact has none for this property. Its key and type can't change.
          #
          # @param request_options [Hash]
          # @param params [Coss::Email::Contacts::Properties::Types::UpdateContactPropertyRequest]
          # @option request_options [String] :base_url
          # @option request_options [Hash{String => Object}] :additional_headers
          # @option request_options [Hash{String => Object}] :additional_query_parameters
          # @option request_options [Hash{String => Object}] :additional_body_parameters
          # @option request_options [Integer] :timeout_in_seconds
          # @option params [String] :id
          #
          # @example
          #   client.email.contacts.properties.update(
          #     id: "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz",
          #     fallback: "starter"
          #   )
          #
          # @return [Coss::Types::ContactProperty]
          def update(request_options: {}, **params)
            params = Coss::Internal::Types::Utils.normalize_keys(params)
            request_data = Coss::Email::Contacts::Properties::Types::UpdateContactPropertyRequest.new(params).to_h
            non_body_param_names = %w[id]
            body = request_data.except(*non_body_param_names)

            request = Coss::Internal::JSON::Request.new(
              base_url: request_options[:base_url],
              method: "PATCH",
              path: "v1/contact_properties/#{URI.encode_uri_component(params[:id].to_s)}",
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
              (response.body.to_s.empty? ? nil : Coss::Types::ContactProperty.load(response.body))
            else
              error_class = Coss::Errors::ResponseError.subclass_for_code(code)
              raise error_class.new(response.body, code: code)
            end
          end
        end
      end
    end
  end
end
