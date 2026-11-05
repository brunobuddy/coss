# frozen_string_literal: true

module Coss
  module Forms
    module Submissions
      class Client
        # @param client [Coss::Internal::Http::RawClient]
        #
        # @return [void]
        def initialize(client:)
          @client = client
        end

        # Newest first. `status` narrows them: `accepted` (delivered), `held` (Risk asked for a review), `spam` and
        # `pending_confirmation` (waiting for the submitter's email link).
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :id
        # @option params [String, nil] :status
        # @option params [Integer, nil] :limit
        # @option params [String, nil] :after
        #
        # @example
        #   client.forms.submissions.list(id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y")
        #
        # @return [Coss::Types::FormSubmissionList]
        def list(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          query_params = {}
          query_params["status"] = params[:status] if params.key?(:status)
          query_params["limit"] = params[:limit] if params.key?(:limit)
          query_params["after"] = params[:after] if params.key?(:after)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/forms/#{URI.encode_uri_component(params[:id].to_s)}/submissions",
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
            (response.body.to_s.empty? ? nil : Coss::Types::FormSubmissionList.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # One submission of the form, with its data, files and Risk's assessment.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :id
        # @option params [String] :submission_id
        #
        # @example
        #   client.forms.submissions.get(
        #     id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
        #     submission_id: "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k"
        #   )
        #
        # @return [Coss::Types::FormSubmission]
        def get(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/forms/#{URI.encode_uri_component(params[:id].to_s)}/submissions/#{URI.encode_uri_component(params[:submission_id].to_s)}",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::FormSubmission.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Deletes the submission and its files.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :id
        # @option params [String] :submission_id
        #
        # @example
        #   client.forms.submissions.remove(
        #     id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
        #     submission_id: "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k"
        #   )
        #
        # @return [Coss::Types::DeletedFormSubmission]
        def remove(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "DELETE",
            path: "v1/forms/#{URI.encode_uri_component(params[:id].to_s)}/submissions/#{URI.encode_uri_component(params[:submission_id].to_s)}",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::DeletedFormSubmission.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Not spam: a `held` or `spam` submission becomes `accepted` and is delivered (webhooks, notifications,
        # contacts), and Risk records its assessment as `legitimate`. Releasing an accepted submission returns it as is.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :id
        # @option params [String] :submission_id
        #
        # @example
        #   client.forms.submissions.release(
        #     id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
        #     submission_id: "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k"
        #   )
        #
        # @return [Coss::Types::FormSubmission]
        def release(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/forms/#{URI.encode_uri_component(params[:id].to_s)}/submissions/#{URI.encode_uri_component(params[:submission_id].to_s)}/release",
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
            (response.body.to_s.empty? ? nil : Coss::Types::FormSubmission.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # A file uploaded with the submission, as `application/octet-stream`: whatever its type, treat it as untrusted
        # (a submitter chose it).
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :id
        # @option params [String] :submission_id
        # @option params [String] :file_id
        #
        # @example
        #   client.forms.submissions.file(
        #     id: "id",
        #     submission_id: "submission_id",
        #     file_id: "file_id"
        #   )
        #
        # @return [untyped]
        def file(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/forms/#{URI.encode_uri_component(params[:id].to_s)}/submissions/#{URI.encode_uri_component(params[:submission_id].to_s)}/files/#{URI.encode_uri_component(params[:file_id].to_s)}",
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
