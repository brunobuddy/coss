# frozen_string_literal: true

module Coss
  class Client
    # @param base_url [String, nil]
    # @param api_key [String]
    # @param api_version [String, nil]
    # @param max_retries [Integer]
    #
    # @return [void]
    def initialize(base_url: nil, api_key: ENV.fetch("COSS_API_KEY", nil), api_version: "2026-10-10", max_retries: 2)
      @raw_client = Coss::Internal::Http::RawClient.new(
        base_url: base_url || Coss::Environment::DEFAULT,
        headers: {
          "User-Agent" => "coss-ruby/0.3.0",
          "X-Fern-Language" => "Ruby",
          Authorization: "Bearer #{api_key}",
          "Coss-Version" => api_version.to_s
        },
        overridable_headers: %w[Coss-Version],
        max_retries: max_retries
      )
    end

    # @return [Coss::Environment::Client]
    def environment
      @environment ||= Coss::Environment::Client.new(client: @raw_client)
    end

    # @return [Coss::APIKey::Client]
    def api_key
      @api_key ||= Coss::APIKey::Client.new(client: @raw_client)
    end

    # @return [Coss::Email::Client]
    def email
      @email ||= Coss::Email::Client.new(client: @raw_client)
    end

    # @return [Coss::Domains::Client]
    def domains
      @domains ||= Coss::Domains::Client.new(client: @raw_client)
    end

    # @return [Coss::WebhookEndpoints::Client]
    def webhook_endpoints
      @webhook_endpoints ||= Coss::WebhookEndpoints::Client.new(client: @raw_client)
    end

    # @return [Coss::WebhookListeners::Client]
    def webhook_listeners
      @webhook_listeners ||= Coss::WebhookListeners::Client.new(client: @raw_client)
    end

    # @return [Coss::WebhookEvents::Client]
    def webhook_events
      @webhook_events ||= Coss::WebhookEvents::Client.new(client: @raw_client)
    end

    # @return [Coss::Sms::Client]
    def sms
      @sms ||= Coss::Sms::Client.new(client: @raw_client)
    end

    # @return [Coss::Verify::Client]
    def verify
      @verify ||= Coss::Verify::Client.new(client: @raw_client)
    end

    # @return [Coss::Forms::Client]
    def forms
      @forms ||= Coss::Forms::Client.new(client: @raw_client)
    end

    # @return [Coss::Reputation::Client]
    def reputation
      @reputation ||= Coss::Reputation::Client.new(client: @raw_client)
    end

    # @return [Coss::Logs::Client]
    def logs
      @logs ||= Coss::Logs::Client.new(client: @raw_client)
    end

    # @return [Coss::AuditEvents::Client]
    def audit_events
      @audit_events ||= Coss::AuditEvents::Client.new(client: @raw_client)
    end

    # @return [Coss::Billing::Client]
    def billing
      @billing ||= Coss::Billing::Client.new(client: @raw_client)
    end

    # @return [Coss::LogDrains::Client]
    def log_drains
      @log_drains ||= Coss::LogDrains::Client.new(client: @raw_client)
    end

    # @return [Coss::Inboxes::Client]
    def inboxes
      @inboxes ||= Coss::Inboxes::Client.new(client: @raw_client)
    end

    # @return [Coss::Risk::Client]
    def risk
      @risk ||= Coss::Risk::Client.new(client: @raw_client)
    end

    # @return [Coss::Hooks::Client]
    def hooks
      @hooks ||= Coss::Hooks::Client.new(client: @raw_client)
    end

    # @return [Coss::Scheduling::Client]
    def scheduling
      @scheduling ||= Coss::Scheduling::Client.new(client: @raw_client)
    end

    # @return [Coss::Sign::Client]
    def sign
      @sign ||= Coss::Sign::Client.new(client: @raw_client)
    end
  end
end
