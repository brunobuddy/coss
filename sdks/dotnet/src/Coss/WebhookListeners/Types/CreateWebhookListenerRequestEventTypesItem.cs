using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(CreateWebhookListenerRequestEventTypesItem.CreateWebhookListenerRequestEventTypesItemSerializer)
)]
[Serializable]
public readonly record struct CreateWebhookListenerRequestEventTypesItem : IStringEnum
{
    public static readonly CreateWebhookListenerRequestEventTypesItem EmailSent = new(
        Values.EmailSent
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailDelivered = new(
        Values.EmailDelivered
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailDeliveryDelayed = new(
        Values.EmailDeliveryDelayed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailBounced = new(
        Values.EmailBounced
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailComplained = new(
        Values.EmailComplained
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailFailed = new(
        Values.EmailFailed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailSuppressed = new(
        Values.EmailSuppressed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailScheduled = new(
        Values.EmailScheduled
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailCanceled = new(
        Values.EmailCanceled
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailOpened = new(
        Values.EmailOpened
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailClicked = new(
        Values.EmailClicked
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailRescheduled = new(
        Values.EmailRescheduled
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailUnsubscribed = new(
        Values.EmailUnsubscribed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem EmailReceived = new(
        Values.EmailReceived
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem DomainDmarcReportReceived =
        new(Values.DomainDmarcReportReceived);

    public static readonly CreateWebhookListenerRequestEventTypesItem AccountReputationWarning =
        new(Values.AccountReputationWarning);

    public static readonly CreateWebhookListenerRequestEventTypesItem AccountReputationRecovered =
        new(Values.AccountReputationRecovered);

    public static readonly CreateWebhookListenerRequestEventTypesItem AccountSuspended = new(
        Values.AccountSuspended
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem AccountReinstated = new(
        Values.AccountReinstated
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem AccountMarketingPaused = new(
        Values.AccountMarketingPaused
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem AccountMarketingReinstated =
        new(Values.AccountMarketingReinstated);

    public static readonly CreateWebhookListenerRequestEventTypesItem SubaccountReputationWarning =
        new(Values.SubaccountReputationWarning);

    public static readonly CreateWebhookListenerRequestEventTypesItem SubaccountReputationRecovered =
        new(Values.SubaccountReputationRecovered);

    public static readonly CreateWebhookListenerRequestEventTypesItem SubaccountPaused = new(
        Values.SubaccountPaused
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SubaccountReinstated = new(
        Values.SubaccountReinstated
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem HookEndpointDisabled = new(
        Values.HookEndpointDisabled
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingInvoiceFinalized = new(
        Values.BillingInvoiceFinalized
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingInvoicePaid = new(
        Values.BillingInvoicePaid
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingInvoicePaymentFailed =
        new(Values.BillingInvoicePaymentFailed);

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingInvoiceVoided = new(
        Values.BillingInvoiceVoided
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingPlanChanged = new(
        Values.BillingPlanChanged
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingUsageThresholdReached =
        new(Values.BillingUsageThresholdReached);

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingHoldPlaced = new(
        Values.BillingHoldPlaced
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingHoldLifted = new(
        Values.BillingHoldLifted
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingCreditGranted = new(
        Values.BillingCreditGranted
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingBudgetThresholdReached =
        new(Values.BillingBudgetThresholdReached);

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingBudgetHoldPlaced = new(
        Values.BillingBudgetHoldPlaced
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BillingBudgetHoldLifted = new(
        Values.BillingBudgetHoldLifted
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem RiskAssessmentReview = new(
        Values.RiskAssessmentReview
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem RiskAssessmentReviewed = new(
        Values.RiskAssessmentReviewed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem ContactCreated = new(
        Values.ContactCreated
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem ContactUpdated = new(
        Values.ContactUpdated
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem ContactDeleted = new(
        Values.ContactDeleted
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem ContactUnsubscribed = new(
        Values.ContactUnsubscribed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem ContactConfirmed = new(
        Values.ContactConfirmed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BroadcastSending = new(
        Values.BroadcastSending
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BroadcastSent = new(
        Values.BroadcastSent
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BroadcastPaused = new(
        Values.BroadcastPaused
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BroadcastCanceled = new(
        Values.BroadcastCanceled
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem BroadcastFailed = new(
        Values.BroadcastFailed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem InboxMessageReceived = new(
        Values.InboxMessageReceived
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SmsScheduled = new(
        Values.SmsScheduled
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SmsSent = new(Values.SmsSent);

    public static readonly CreateWebhookListenerRequestEventTypesItem SmsDelivered = new(
        Values.SmsDelivered
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SmsUndelivered = new(
        Values.SmsUndelivered
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SmsFailed = new(
        Values.SmsFailed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SmsSuppressed = new(
        Values.SmsSuppressed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SmsCanceled = new(
        Values.SmsCanceled
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SmsReceived = new(
        Values.SmsReceived
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SmsOptedOut = new(
        Values.SmsOptedOut
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SmsOptedIn = new(
        Values.SmsOptedIn
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SignRequestSent = new(
        Values.SignRequestSent
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SignRequestViewed = new(
        Values.SignRequestViewed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SignRequestSignerSigned = new(
        Values.SignRequestSignerSigned
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SignRequestDeclined = new(
        Values.SignRequestDeclined
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SignRequestCompleted = new(
        Values.SignRequestCompleted
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SignRequestCanceled = new(
        Values.SignRequestCanceled
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SignRequestExpired = new(
        Values.SignRequestExpired
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem VerificationApproved = new(
        Values.VerificationApproved
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem VerificationFailed = new(
        Values.VerificationFailed
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem VerificationBlocked = new(
        Values.VerificationBlocked
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem FormSubmissionReceived = new(
        Values.FormSubmissionReceived
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem FormSubmissionFlagged = new(
        Values.FormSubmissionFlagged
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingCreated =
        new(Values.SchedulingBookingCreated);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingPendingApproval =
        new(Values.SchedulingBookingPendingApproval);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingConfirmed =
        new(Values.SchedulingBookingConfirmed);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingRescheduled =
        new(Values.SchedulingBookingRescheduled);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingCancelled =
        new(Values.SchedulingBookingCancelled);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingDeclined =
        new(Values.SchedulingBookingDeclined);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingNoShow = new(
        Values.SchedulingBookingNoShow
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingExternalConflict =
        new(Values.SchedulingBookingExternalConflict);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingCalendarWriteFailed =
        new(Values.SchedulingBookingCalendarWriteFailed);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingLocationReady =
        new(Values.SchedulingBookingLocationReady);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingStarted =
        new(Values.SchedulingBookingStarted);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingEnded = new(
        Values.SchedulingBookingEnded
    );

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingBookingReminder =
        new(Values.SchedulingBookingReminder);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingCalendarConnected =
        new(Values.SchedulingCalendarConnected);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingCalendarNeedsReauth =
        new(Values.SchedulingCalendarNeedsReauth);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingCalendarDisconnected =
        new(Values.SchedulingCalendarDisconnected);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingCalendarDelegationFailing =
        new(Values.SchedulingCalendarDelegationFailing);

    public static readonly CreateWebhookListenerRequestEventTypesItem SchedulingCalendarDelegationRestored =
        new(Values.SchedulingCalendarDelegationRestored);

    public CreateWebhookListenerRequestEventTypesItem(string value)
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
    public static CreateWebhookListenerRequestEventTypesItem FromCustom(string value)
    {
        return new CreateWebhookListenerRequestEventTypesItem(value);
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
        CreateWebhookListenerRequestEventTypesItem value1,
        string value2
    ) => value1.Value.Equals(value2);

    public static bool operator !=(
        CreateWebhookListenerRequestEventTypesItem value1,
        string value2
    ) => !value1.Value.Equals(value2);

    public static explicit operator string(CreateWebhookListenerRequestEventTypesItem value) =>
        value.Value;

    public static explicit operator CreateWebhookListenerRequestEventTypesItem(string value) =>
        new(value);

    internal class CreateWebhookListenerRequestEventTypesItemSerializer
        : JsonConverter<CreateWebhookListenerRequestEventTypesItem>
    {
        public override CreateWebhookListenerRequestEventTypesItem Read(
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
            return new CreateWebhookListenerRequestEventTypesItem(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateWebhookListenerRequestEventTypesItem value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override CreateWebhookListenerRequestEventTypesItem ReadAsPropertyName(
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
            return new CreateWebhookListenerRequestEventTypesItem(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateWebhookListenerRequestEventTypesItem value,
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
