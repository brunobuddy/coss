using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(CreateWebhookEndpointRequestEventTypesItem.CreateWebhookEndpointRequestEventTypesItemSerializer)
)]
[Serializable]
public readonly record struct CreateWebhookEndpointRequestEventTypesItem : IStringEnum
{
    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailSent = new(
        Values.EmailSent
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailDelivered = new(
        Values.EmailDelivered
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailDeliveryDelayed = new(
        Values.EmailDeliveryDelayed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailBounced = new(
        Values.EmailBounced
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailComplained = new(
        Values.EmailComplained
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailFailed = new(
        Values.EmailFailed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailSuppressed = new(
        Values.EmailSuppressed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailScheduled = new(
        Values.EmailScheduled
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailCanceled = new(
        Values.EmailCanceled
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailOpened = new(
        Values.EmailOpened
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailClicked = new(
        Values.EmailClicked
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailRescheduled = new(
        Values.EmailRescheduled
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailUnsubscribed = new(
        Values.EmailUnsubscribed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem EmailReceived = new(
        Values.EmailReceived
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem DomainDmarcReportReceived =
        new(Values.DomainDmarcReportReceived);

    public static readonly CreateWebhookEndpointRequestEventTypesItem AccountReputationWarning =
        new(Values.AccountReputationWarning);

    public static readonly CreateWebhookEndpointRequestEventTypesItem AccountReputationRecovered =
        new(Values.AccountReputationRecovered);

    public static readonly CreateWebhookEndpointRequestEventTypesItem AccountSuspended = new(
        Values.AccountSuspended
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem AccountReinstated = new(
        Values.AccountReinstated
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem AccountMarketingPaused = new(
        Values.AccountMarketingPaused
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem AccountMarketingReinstated =
        new(Values.AccountMarketingReinstated);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SubaccountReputationWarning =
        new(Values.SubaccountReputationWarning);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SubaccountReputationRecovered =
        new(Values.SubaccountReputationRecovered);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SubaccountPaused = new(
        Values.SubaccountPaused
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SubaccountReinstated = new(
        Values.SubaccountReinstated
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem HookEndpointDisabled = new(
        Values.HookEndpointDisabled
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingInvoiceFinalized = new(
        Values.BillingInvoiceFinalized
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingInvoicePaid = new(
        Values.BillingInvoicePaid
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingInvoicePaymentFailed =
        new(Values.BillingInvoicePaymentFailed);

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingInvoiceVoided = new(
        Values.BillingInvoiceVoided
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingPlanChanged = new(
        Values.BillingPlanChanged
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingUsageThresholdReached =
        new(Values.BillingUsageThresholdReached);

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingHoldPlaced = new(
        Values.BillingHoldPlaced
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingHoldLifted = new(
        Values.BillingHoldLifted
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingCreditGranted = new(
        Values.BillingCreditGranted
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingBudgetThresholdReached =
        new(Values.BillingBudgetThresholdReached);

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingBudgetHoldPlaced = new(
        Values.BillingBudgetHoldPlaced
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BillingBudgetHoldLifted = new(
        Values.BillingBudgetHoldLifted
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem RiskAssessmentReview = new(
        Values.RiskAssessmentReview
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem RiskAssessmentReviewed = new(
        Values.RiskAssessmentReviewed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem ContactCreated = new(
        Values.ContactCreated
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem ContactUpdated = new(
        Values.ContactUpdated
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem ContactDeleted = new(
        Values.ContactDeleted
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem ContactUnsubscribed = new(
        Values.ContactUnsubscribed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem ContactConfirmed = new(
        Values.ContactConfirmed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BroadcastSending = new(
        Values.BroadcastSending
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BroadcastSent = new(
        Values.BroadcastSent
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BroadcastPaused = new(
        Values.BroadcastPaused
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BroadcastCanceled = new(
        Values.BroadcastCanceled
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem BroadcastFailed = new(
        Values.BroadcastFailed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem InboxMessageReceived = new(
        Values.InboxMessageReceived
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SmsScheduled = new(
        Values.SmsScheduled
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SmsSent = new(Values.SmsSent);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SmsDelivered = new(
        Values.SmsDelivered
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SmsUndelivered = new(
        Values.SmsUndelivered
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SmsFailed = new(
        Values.SmsFailed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SmsSuppressed = new(
        Values.SmsSuppressed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SmsCanceled = new(
        Values.SmsCanceled
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SmsReceived = new(
        Values.SmsReceived
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SmsOptedOut = new(
        Values.SmsOptedOut
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SmsOptedIn = new(
        Values.SmsOptedIn
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SignRequestSent = new(
        Values.SignRequestSent
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SignRequestViewed = new(
        Values.SignRequestViewed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SignRequestSignerSigned = new(
        Values.SignRequestSignerSigned
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SignRequestDeclined = new(
        Values.SignRequestDeclined
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SignRequestCompleted = new(
        Values.SignRequestCompleted
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SignRequestCanceled = new(
        Values.SignRequestCanceled
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SignRequestExpired = new(
        Values.SignRequestExpired
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem VerificationApproved = new(
        Values.VerificationApproved
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem VerificationFailed = new(
        Values.VerificationFailed
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem VerificationBlocked = new(
        Values.VerificationBlocked
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem FormSubmissionReceived = new(
        Values.FormSubmissionReceived
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem FormSubmissionFlagged = new(
        Values.FormSubmissionFlagged
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingCreated =
        new(Values.SchedulingBookingCreated);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingPendingApproval =
        new(Values.SchedulingBookingPendingApproval);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingConfirmed =
        new(Values.SchedulingBookingConfirmed);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingRescheduled =
        new(Values.SchedulingBookingRescheduled);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingCancelled =
        new(Values.SchedulingBookingCancelled);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingDeclined =
        new(Values.SchedulingBookingDeclined);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingNoShow = new(
        Values.SchedulingBookingNoShow
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingExternalConflict =
        new(Values.SchedulingBookingExternalConflict);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingCalendarWriteFailed =
        new(Values.SchedulingBookingCalendarWriteFailed);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingLocationReady =
        new(Values.SchedulingBookingLocationReady);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingStarted =
        new(Values.SchedulingBookingStarted);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingEnded = new(
        Values.SchedulingBookingEnded
    );

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingBookingReminder =
        new(Values.SchedulingBookingReminder);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingCalendarConnected =
        new(Values.SchedulingCalendarConnected);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingCalendarNeedsReauth =
        new(Values.SchedulingCalendarNeedsReauth);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingCalendarDisconnected =
        new(Values.SchedulingCalendarDisconnected);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingCalendarDelegationFailing =
        new(Values.SchedulingCalendarDelegationFailing);

    public static readonly CreateWebhookEndpointRequestEventTypesItem SchedulingCalendarDelegationRestored =
        new(Values.SchedulingCalendarDelegationRestored);

    public CreateWebhookEndpointRequestEventTypesItem(string value)
    {
        Value = value;
    }

    /// <summary>
    /// The string value of the enum.
    /// </summary>
    public string Value { get; }

    /// <summary>
    /// Create a string enum with the given value.
    /// </summary>
    public static CreateWebhookEndpointRequestEventTypesItem FromCustom(string value)
    {
        return new CreateWebhookEndpointRequestEventTypesItem(value);
    }

    public bool Equals(string? other)
    {
        return Value.Equals(other);
    }

    /// <summary>
    /// Returns the string value of the enum.
    /// </summary>
    public override string ToString()
    {
        return Value;
    }

    public static bool operator ==(
        CreateWebhookEndpointRequestEventTypesItem value1,
        string value2
    ) => value1.Value.Equals(value2);

    public static bool operator !=(
        CreateWebhookEndpointRequestEventTypesItem value1,
        string value2
    ) => !value1.Value.Equals(value2);

    public static explicit operator string(CreateWebhookEndpointRequestEventTypesItem value) =>
        value.Value;

    public static explicit operator CreateWebhookEndpointRequestEventTypesItem(string value) =>
        new(value);

    internal class CreateWebhookEndpointRequestEventTypesItemSerializer
        : JsonConverter<CreateWebhookEndpointRequestEventTypesItem>
    {
        public override CreateWebhookEndpointRequestEventTypesItem Read(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new global::System.Exception(
                    "The JSON value could not be read as a string."
                );
            return new CreateWebhookEndpointRequestEventTypesItem(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateWebhookEndpointRequestEventTypesItem value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override CreateWebhookEndpointRequestEventTypesItem ReadAsPropertyName(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new global::System.Exception(
                    "The JSON property name could not be read as a string."
                );
            return new CreateWebhookEndpointRequestEventTypesItem(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateWebhookEndpointRequestEventTypesItem value,
            JsonSerializerOptions options
        )
        {
            writer.WritePropertyName(value.Value);
        }
    }

    /// <summary>
    /// Constant strings for enum values
    /// </summary>
    [Serializable]
    public static class Values
    {
        public const string EmailSent = "email.sent";

        public const string EmailDelivered = "email.delivered";

        public const string EmailDeliveryDelayed = "email.delivery_delayed";

        public const string EmailBounced = "email.bounced";

        public const string EmailComplained = "email.complained";

        public const string EmailFailed = "email.failed";

        public const string EmailSuppressed = "email.suppressed";

        public const string EmailScheduled = "email.scheduled";

        public const string EmailCanceled = "email.canceled";

        public const string EmailOpened = "email.opened";

        public const string EmailClicked = "email.clicked";

        public const string EmailRescheduled = "email.rescheduled";

        public const string EmailUnsubscribed = "email.unsubscribed";

        public const string EmailReceived = "email.received";

        public const string DomainDmarcReportReceived = "domain.dmarc_report_received";

        public const string AccountReputationWarning = "account.reputation_warning";

        public const string AccountReputationRecovered = "account.reputation_recovered";

        public const string AccountSuspended = "account.suspended";

        public const string AccountReinstated = "account.reinstated";

        public const string AccountMarketingPaused = "account.marketing_paused";

        public const string AccountMarketingReinstated = "account.marketing_reinstated";

        public const string SubaccountReputationWarning = "subaccount.reputation_warning";

        public const string SubaccountReputationRecovered = "subaccount.reputation_recovered";

        public const string SubaccountPaused = "subaccount.paused";

        public const string SubaccountReinstated = "subaccount.reinstated";

        public const string HookEndpointDisabled = "hook_endpoint.disabled";

        public const string BillingInvoiceFinalized = "billing.invoice_finalized";

        public const string BillingInvoicePaid = "billing.invoice_paid";

        public const string BillingInvoicePaymentFailed = "billing.invoice_payment_failed";

        public const string BillingInvoiceVoided = "billing.invoice_voided";

        public const string BillingPlanChanged = "billing.plan_changed";

        public const string BillingUsageThresholdReached = "billing.usage_threshold_reached";

        public const string BillingHoldPlaced = "billing.hold_placed";

        public const string BillingHoldLifted = "billing.hold_lifted";

        public const string BillingCreditGranted = "billing.credit_granted";

        public const string BillingBudgetThresholdReached = "billing.budget_threshold_reached";

        public const string BillingBudgetHoldPlaced = "billing.budget_hold_placed";

        public const string BillingBudgetHoldLifted = "billing.budget_hold_lifted";

        public const string RiskAssessmentReview = "risk.assessment.review";

        public const string RiskAssessmentReviewed = "risk.assessment.reviewed";

        public const string ContactCreated = "contact.created";

        public const string ContactUpdated = "contact.updated";

        public const string ContactDeleted = "contact.deleted";

        public const string ContactUnsubscribed = "contact.unsubscribed";

        public const string ContactConfirmed = "contact.confirmed";

        public const string BroadcastSending = "broadcast.sending";

        public const string BroadcastSent = "broadcast.sent";

        public const string BroadcastPaused = "broadcast.paused";

        public const string BroadcastCanceled = "broadcast.canceled";

        public const string BroadcastFailed = "broadcast.failed";

        public const string InboxMessageReceived = "inbox.message.received";

        public const string SmsScheduled = "sms.scheduled";

        public const string SmsSent = "sms.sent";

        public const string SmsDelivered = "sms.delivered";

        public const string SmsUndelivered = "sms.undelivered";

        public const string SmsFailed = "sms.failed";

        public const string SmsSuppressed = "sms.suppressed";

        public const string SmsCanceled = "sms.canceled";

        public const string SmsReceived = "sms.received";

        public const string SmsOptedOut = "sms.opted_out";

        public const string SmsOptedIn = "sms.opted_in";

        public const string SignRequestSent = "sign_request.sent";

        public const string SignRequestViewed = "sign_request.viewed";

        public const string SignRequestSignerSigned = "sign_request.signer_signed";

        public const string SignRequestDeclined = "sign_request.declined";

        public const string SignRequestCompleted = "sign_request.completed";

        public const string SignRequestCanceled = "sign_request.canceled";

        public const string SignRequestExpired = "sign_request.expired";

        public const string VerificationApproved = "verification.approved";

        public const string VerificationFailed = "verification.failed";

        public const string VerificationBlocked = "verification.blocked";

        public const string FormSubmissionReceived = "form.submission.received";

        public const string FormSubmissionFlagged = "form.submission.flagged";

        public const string SchedulingBookingCreated = "scheduling.booking.created";

        public const string SchedulingBookingPendingApproval =
            "scheduling.booking.pending_approval";

        public const string SchedulingBookingConfirmed = "scheduling.booking.confirmed";

        public const string SchedulingBookingRescheduled = "scheduling.booking.rescheduled";

        public const string SchedulingBookingCancelled = "scheduling.booking.cancelled";

        public const string SchedulingBookingDeclined = "scheduling.booking.declined";

        public const string SchedulingBookingNoShow = "scheduling.booking.no_show";

        public const string SchedulingBookingExternalConflict =
            "scheduling.booking.external_conflict";

        public const string SchedulingBookingCalendarWriteFailed =
            "scheduling.booking.calendar_write_failed";

        public const string SchedulingBookingLocationReady = "scheduling.booking.location_ready";

        public const string SchedulingBookingStarted = "scheduling.booking.started";

        public const string SchedulingBookingEnded = "scheduling.booking.ended";

        public const string SchedulingBookingReminder = "scheduling.booking.reminder";

        public const string SchedulingCalendarConnected = "scheduling.calendar.connected";

        public const string SchedulingCalendarNeedsReauth = "scheduling.calendar.needs_reauth";

        public const string SchedulingCalendarDisconnected = "scheduling.calendar.disconnected";

        public const string SchedulingCalendarDelegationFailing =
            "scheduling.calendar_delegation.failing";

        public const string SchedulingCalendarDelegationRestored =
            "scheduling.calendar_delegation.restored";
    }
}
