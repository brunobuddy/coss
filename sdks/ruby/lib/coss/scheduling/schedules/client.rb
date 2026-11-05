# frozen_string_literal: true

module Coss
  module Scheduling
    module Schedules
      class Client
        # @param client [Coss::Internal::Http::RawClient]
        #
        # @return [void]
        def initialize(client:)
          @client = client
        end

        # All of the host's schedules, oldest first.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        #
        # @example
        #   client.scheduling.schedules.list(host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m")
        #
        # @return [Coss::Types::SchedulingScheduleList]
        def list(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/schedules",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingScheduleList.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # A host's weekly hours and date overrides, in local time. The first one is the host's default.
        #
        # @param request_options [Hash]
        # @param params [Coss::Types::UpsertScheduleRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        #
        # @example
        #   client.scheduling.schedules.create(
        #     host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     name: "Clinic hours",
        #     rules: [{
        #       days: [1, 2, 3, 4, 5],
        #       start: "09:00",
        #       end_: "17:00"
        #     }],
        #     overrides: [{
        #       date: "2027-12-24",
        #       ranges: [{
        #         start: "start",
        #         end_: "end"
        #       }]
        #     }]
        #   )
        #
        # @return [Coss::Types::SchedulingSchedule]
        def create(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          path_param_names = %i[host]
          body_params = params.except(*path_param_names)

          headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "POST",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/schedules",
            headers: headers,
            body: Coss::Types::UpsertScheduleRequest.new(body_params).to_h,
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
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingSchedule.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # One of the host's schedules.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        # @option params [String] :schedule_id
        #
        # @example
        #   client.scheduling.schedules.get(
        #     host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     schedule_id: "sched_01kd2m9a0b1c2d3e4f5g6h7j8m"
        #   )
        #
        # @return [Coss::Types::SchedulingSchedule]
        def get(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "GET",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/schedules/#{URI.encode_uri_component(params[:schedule_id].to_s)}",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingSchedule.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Replaces its weekly rules, and its overrides when given. Existing bookings stay: a schedule only decides
        # what's offered next.
        #
        # @param request_options [Hash]
        # @param params [Coss::Types::UpsertScheduleRequest]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        # @option params [String] :schedule_id
        #
        # @example
        #   client.scheduling.schedules.update(
        #     host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     schedule_id: "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     name: "Clinic hours",
        #     rules: [{
        #       days: [1, 2, 3, 4, 5],
        #       start: "09:00",
        #       end_: "17:00"
        #     }],
        #     overrides: [{
        #       date: "2027-12-24",
        #       ranges: [{
        #         start: "start",
        #         end_: "end"
        #       }]
        #     }]
        #   )
        #
        # @return [Coss::Types::SchedulingSchedule]
        def update(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          path_param_names = %i[host schedule_id]
          body_params = params.except(*path_param_names)

          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "PUT",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/schedules/#{URI.encode_uri_component(params[:schedule_id].to_s)}",
            body: Coss::Types::UpsertScheduleRequest.new(body_params).to_h,
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::SchedulingSchedule.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end

        # Refused for the host's default schedule.
        #
        # @param request_options [Hash]
        # @param params [Hash]
        # @option request_options [String] :base_url
        # @option request_options [Hash{String => Object}] :additional_headers
        # @option request_options [Hash{String => Object}] :additional_query_parameters
        # @option request_options [Hash{String => Object}] :additional_body_parameters
        # @option request_options [Integer] :timeout_in_seconds
        # @option params [String] :host
        # @option params [String] :schedule_id
        #
        # @example
        #   client.scheduling.schedules.remove(
        #     host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        #     schedule_id: "sched_01kd2m9a0b1c2d3e4f5g6h7j8m"
        #   )
        #
        # @return [Coss::Types::DeletedSchedulingSchedule]
        def remove(request_options: {}, **params)
          params = Coss::Internal::Types::Utils.normalize_keys(params)
          request = Coss::Internal::JSON::Request.new(
            base_url: request_options[:base_url],
            method: "DELETE",
            path: "v1/scheduling/hosts/#{URI.encode_uri_component(params[:host].to_s)}/schedules/#{URI.encode_uri_component(params[:schedule_id].to_s)}",
            request_options: request_options
          )
          begin
            response = @client.send(request)
          rescue Net::HTTPRequestTimeout
            raise Coss::Errors::TimeoutError
          end
          code = response.code.to_i
          if code.between?(200, 299)
            (response.body.to_s.empty? ? nil : Coss::Types::DeletedSchedulingSchedule.load(response.body))
          else
            error_class = Coss::Errors::ResponseError.subclass_for_code(code)
            raise error_class.new(response.body, code: code)
          end
        end
      end
    end
  end
end
