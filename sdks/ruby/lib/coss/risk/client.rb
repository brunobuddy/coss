# frozen_string_literal: true

module Coss
  module Risk
    class Client
      # @param client [Coss::Internal::Http::RawClient]
      #
      # @return [void]
      def initialize(client:)
        @client = client
      end

      # Assesses a sign-up, login or other event in the API key's environment and returns a decision (`allow`, `review`
      # or `block`) with a score and the reasons behind it. coss.com combines email and IP signals with what it has seen
      # in this environment (velocity, accounts sharing a mailbox, identifiers you reported) and your allow and block
      # lists. Signals that are unavailable at the moment are skipped and listed in `degraded`. Call it from your
      # server, never from the browser, and treat errors as `allow` (fail open) so an outage never locks your users out.
      # `review` decisions also fire a `risk.assessment.review` webhook. Live assessments are billed
      # (`risk.assessments`; plans include some every month) unless they end in `block`. Past Free's allowance, on a
      # billing hold or over a budget, they are free and made without velocity, memory or content (`usage_limit` in
      # `degraded`); they never fail over billing. Sandbox (`coss_test_…`) keys accept documented test addresses
      # (`192.0.2.x`, `@disposable.test`, `@undeliverable.test`).
      #
      # @param request_options [Hash]
      # @param params [Coss::Risk::Types::CreateRiskAssessmentRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String, nil] :idempotency_key
      #
      # @example
      #   client.risk.assess(
      #     idempotency_key: "welcome-user-123",
      #     event: "signup",
      #     user: {
      #       email: "ada@gmail.con"
      #     },
      #     ip: "203.0.113.7",
      #     user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15"
      #   )
      #
      # @return [Coss::Types::RiskAssessment]
      def assess(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request_data = Coss::Risk::Types::CreateRiskAssessmentRequest.new(params).to_h
        non_body_param_names = %w[Idempotency-Key]
        body = request_data.except(*non_body_param_names)

        headers = {}
        headers["Idempotency-Key"] = params[:idempotency_key] if params[:idempotency_key]

        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/risk/assessments",
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
          (response.body.to_s.empty? ? nil : Coss::Types::RiskAssessment.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Tells coss.com what the assessed user turned out to be. `fraud` and `abuse` make later assessments with the same
      # mailbox, user, IP address or subnet flag it (`history.fraud_*`); `legitimate` takes back what this assessment
      # reported. Resolves an open review. Sending the latest outcome again changes nothing.
      #
      # @param request_options [Hash]
      # @param params [Coss::Risk::Types::CreateRiskFeedbackRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String] :id
      #
      # @example
      #   client.risk.feedback(
      #     id: "rsk_01k7c8m4q2f3e9v6t5r1n0p8yz",
      #     outcome: "fraud"
      #   )
      #
      # @return [Coss::Types::RiskAssessment]
      def feedback(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request_data = Coss::Risk::Types::CreateRiskFeedbackRequest.new(params).to_h
        non_body_param_names = %w[id]
        body = request_data.except(*non_body_param_names)

        headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/risk/assessments/#{URI.encode_uri_component(params[:id].to_s)}/feedback",
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
          (response.body.to_s.empty? ? nil : Coss::Types::RiskAssessment.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # How often each reason and rule was right over the last 90 days, by the outcomes you reported with feedback, and
      # the reason weights that supports. Nothing changes until you apply them with `reason_weights` in the settings.
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
      #   client.risk.calibration
      #
      # @return [Coss::Types::RiskCalibration]
      def calibration(request_options: {}, **_params)
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "GET",
          path: "v1/risk/calibration",
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::RiskCalibration.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Email intelligence on its own: syntax, disposable domains, whether the domain can receive mail (DNS), role
      # accounts, free providers, the canonical mailbox, typo suggestions and the domain's age (RDAP). Stateless:
      # nothing is stored or counted, so it never flags an address for having been seen before (assessments do). Failed
      # lookups are listed in `degraded`. Sandbox keys see the documented test domains (`@disposable.test`,
      # `@undeliverable.test`, `@new.test`).
      #
      # @param request_options [Hash]
      # @param params [Coss::Risk::Types::RiskEmailCheckRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      #
      # @example
      #   client.risk.check_email(email: "ada@gnail.com")
      #
      # @return [Coss::Types::RiskEmailCheck]
      def check_email(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/risk/email/check",
          headers: headers,
          body: Coss::Risk::Types::RiskEmailCheckRequest.new(params).to_h,
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::RiskEmailCheck.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # IP intelligence on its own: Tor exit nodes, cloud and hosting networks, networks mostly used by VPN and proxy
      # services, the network (ASN) and its country. Stateless. Missing IP data is reported in `degraded`. Sandbox keys
      # see the documentation addresses (`192.0.2.1` Tor, `.2` cloud, `.3` VPN, the rest residential).
      #
      # @param request_options [Hash]
      # @param params [Coss::Risk::Types::RiskIPCheckRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      #
      # @example
      #   client.risk.check_ip(ip: "185.220.101.1")
      #
      # @return [Coss::Types::RiskIPCheck]
      def check_ip(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/risk/ip/check",
          headers: headers,
          body: Coss::Risk::Types::RiskIPCheckRequest.new(params).to_h,
          request_options: request_options
        )
        begin
          response = @client.send(request)
        rescue Net::HTTPRequestTimeout
          raise Coss::Errors::TimeoutError
        end
        code = response.code.to_i
        if code.between?(200, 299)
          (response.body.to_s.empty? ? nil : Coss::Types::RiskIPCheck.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Phone intelligence on its own: whether the number exists in its country's numbering plan, its line type (mobile,
      # landline, fixed or non-fixed VoIP, toll-free…) and carrier, and the last SIM swap where carriers share it.
      # Stateless. A failed lookup is reported in `degraded`. Each live check that gets an answer is billed
      # (`risk.phone_checks`; plans include some every month, and Free stops at its allowance); invalid numbers, failed
      # lookups and sandbox checks are free. Limited per organization as well as per key. Sandbox keys see the fictional
      # numbers `+1 202 555 01xx` (`0101` landline, `0102` non-fixed VoIP, `0103` fixed VoIP, `0104` a recent SIM swap,
      # `0199` invalid, the rest mobile).
      #
      # @param request_options [Hash]
      # @param params [Coss::Risk::Types::RiskPhoneCheckRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      #
      # @example
      #   client.risk.check_phone(phone: "+14155550123")
      #
      # @return [Coss::Types::RiskPhoneCheck]
      def check_phone(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/risk/phone/check",
          headers: headers,
          body: Coss::Risk::Types::RiskPhoneCheckRequest.new(params).to_h,
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
          (response.body.to_s.empty? ? nil : Coss::Types::RiskPhoneCheck.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Scores text people post on your platform (a profile bio, a comment, a listing) for spam, phishing, malware and
      # fraud with an AI model, with zero data retention. Returns scores only: you decide what they mean. Neither the
      # text nor the scores are stored, and request logs keep no body for this endpoint. Takes up to 3 seconds; a
      # failure is a 503 you can retry or treat as unknown. Each live classification the model answered is billed
      # (`risk.content_checks`; plans include some every month, and Free stops at its allowance). Limited per
      # organization as well as per key. Sandbox keys use markers instead of a model: `[coss-test:phishing]` scores
      # 0.99, `[coss-test:spam:0.4]` exactly 0.4, everything else 0.01.
      #
      # @param request_options [Hash]
      # @param params [Coss::Risk::Types::RiskContentClassifyRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      #
      # @example
      #   client.risk.classify(text: "Earn $5,000 a week from home! DM me on Telegram: t.me/fast-cash")
      #
      # @return [Coss::Types::RiskContentClassification]
      def classify(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        headers = { "Idempotency-Key" => Coss::Internal::IdempotencyKey.generate }
        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/risk/content/classify",
          headers: headers,
          body: Coss::Risk::Types::RiskContentClassifyRequest.new(params).to_h,
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
          (response.body.to_s.empty? ? nil : Coss::Types::RiskContentClassification.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # Takes `cost` tokens (default 1) from `key`'s share of one of your buckets and says whether to let the request
      # through: a 200 either way, with `allowed`. Denied requests take nothing. Each key has its own bucket of `burst`
      # tokens refilling at `limit` per `period_seconds` (GCRA, the algorithm coss.com limits its own API with).
      # coss.com keeps only a keyed hash of `key`. While coss.com can't count, the bucket's `on_failure` answers and
      # `degraded` is true.
      #
      # @param request_options [Hash]
      # @param params [Coss::Risk::Types::CheckRiskLimitRequest]
      # @option request_options [String] :base_url
      # @option request_options [Hash{String => Object}] :additional_headers
      # @option request_options [Hash{String => Object}] :additional_query_parameters
      # @option request_options [Hash{String => Object}] :additional_body_parameters
      # @option request_options [Integer] :timeout_in_seconds
      # @option params [String, nil] :idempotency_key
      #
      # @example
      #   client.risk.limit(
      #     idempotency_key: "welcome-user-123",
      #     bucket: "password_reset",
      #     key: "ada@example.com"
      #   )
      #
      # @return [Coss::Types::RiskLimit]
      def limit(request_options: {}, **params)
        params = Coss::Internal::Types::Utils.normalize_keys(params)
        request_data = Coss::Risk::Types::CheckRiskLimitRequest.new(params).to_h
        non_body_param_names = %w[Idempotency-Key]
        body = request_data.except(*non_body_param_names)

        headers = {}
        headers["Idempotency-Key"] = params[:idempotency_key] if params[:idempotency_key]

        request = Coss::Internal::JSON::Request.new(
          base_url: request_options[:base_url],
          method: "POST",
          path: "v1/risk/limits",
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
          (response.body.to_s.empty? ? nil : Coss::Types::RiskLimit.load(response.body))
        else
          error_class = Coss::Errors::ResponseError.subclass_for_code(code)
          raise error_class.new(response.body, code: code)
        end
      end

      # @return [Coss::Assessments::Client]
      def assessments
        @assessments ||= Coss::Risk::Assessments::Client.new(client: @client)
      end

      # @return [Coss::Lists::Client]
      def lists
        @lists ||= Coss::Risk::Lists::Client.new(client: @client)
      end

      # @return [Coss::Users::Client]
      def users
        @users ||= Coss::Risk::Users::Client.new(client: @client)
      end

      # @return [Coss::Settings::Client]
      def settings
        @settings ||= Coss::Risk::Settings::Client.new(client: @client)
      end

      # @return [Coss::Rules::Client]
      def rules
        @rules ||= Coss::Risk::Rules::Client.new(client: @client)
      end

      # @return [Coss::LimitBuckets::Client]
      def limit_buckets
        @limit_buckets ||= Coss::Risk::LimitBuckets::Client.new(client: @client)
      end
    end
  end
end
