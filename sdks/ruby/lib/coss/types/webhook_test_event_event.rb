# frozen_string_literal: true

module Coss
  module Types
    # The event, as an endpoint on the request's API version receives it. Its `webhook-id` header is `event.id`.
    class WebhookTestEventEvent < Internal::Types::Model
      extend Coss::Internal::Types::Union

      member -> { Coss::Types::EmailWebhookEvent }

      member -> { Coss::Types::ReceivedEmailWebhookEvent }

      member -> { Coss::Types::HookEndpointWebhookEvent }

      member -> { Coss::Types::RiskWebhookEvent }

      member -> { Coss::Types::ContactWebhookEvent }

      member -> { Coss::Types::BroadcastWebhookEvent }

      member -> { Coss::Types::InboxMessageReceivedWebhookEvent }

      member -> { Coss::Types::SmsWebhookEvent }

      member -> { Coss::Types::ReceivedSmsWebhookEvent }

      member -> { Coss::Types::SignRequestWebhookEvent }

      member -> { Coss::Types::VerificationWebhookEvent }

      member -> { Coss::Types::FormSubmissionWebhookEvent }

      member -> { Coss::Types::SchedulingBookingWebhookEvent }

      member -> { Coss::Types::SchedulingCalendarWebhookEvent }

      member -> { Coss::Types::SchedulingCalendarDelegationWebhookEvent }
    end
  end
end
