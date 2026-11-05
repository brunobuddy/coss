using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(BillingWebhookEventThreeDataMeter.BillingWebhookEventThreeDataMeterSerializer)
)]
[Serializable]
public readonly record struct BillingWebhookEventThreeDataMeter : IStringEnum
{
    public static readonly BillingWebhookEventThreeDataMeter EmailRecipients = new(
        Values.EmailRecipients
    );

    public static readonly BillingWebhookEventThreeDataMeter EmailDedicatedIp = new(
        Values.EmailDedicatedIp
    );

    public static readonly BillingWebhookEventThreeDataMeter EmailAttachmentData = new(
        Values.EmailAttachmentData
    );

    public static readonly BillingWebhookEventThreeDataMeter EmailReceived = new(
        Values.EmailReceived
    );

    public static readonly BillingWebhookEventThreeDataMeter EmailReceivedData = new(
        Values.EmailReceivedData
    );

    public static readonly BillingWebhookEventThreeDataMeter EmailInboxes = new(
        Values.EmailInboxes
    );

    public static readonly BillingWebhookEventThreeDataMeter SmsSegments = new(Values.SmsSegments);

    public static readonly BillingWebhookEventThreeDataMeter SmsReceivedSegments = new(
        Values.SmsReceivedSegments
    );

    public static readonly BillingWebhookEventThreeDataMeter SmsNumbers = new(Values.SmsNumbers);

    public static readonly BillingWebhookEventThreeDataMeter SmsRegistrations = new(
        Values.SmsRegistrations
    );

    public static readonly BillingWebhookEventThreeDataMeter SignCompletedRequests = new(
        Values.SignCompletedRequests
    );

    public static readonly BillingWebhookEventThreeDataMeter RiskPhoneChecks = new(
        Values.RiskPhoneChecks
    );

    public static readonly BillingWebhookEventThreeDataMeter RiskAssessments = new(
        Values.RiskAssessments
    );

    public static readonly BillingWebhookEventThreeDataMeter RiskContentChecks = new(
        Values.RiskContentChecks
    );

    public static readonly BillingWebhookEventThreeDataMeter VerifyVerifications = new(
        Values.VerifyVerifications
    );

    public static readonly BillingWebhookEventThreeDataMeter VerifySms = new(Values.VerifySms);

    public static readonly BillingWebhookEventThreeDataMeter FormsSubmissions = new(
        Values.FormsSubmissions
    );

    public static readonly BillingWebhookEventThreeDataMeter FormsFileUploads = new(
        Values.FormsFileUploads
    );

    public static readonly BillingWebhookEventThreeDataMeter SchedulingBookings = new(
        Values.SchedulingBookings
    );

    public static readonly BillingWebhookEventThreeDataMeter SchedulingHosts = new(
        Values.SchedulingHosts
    );

    public static readonly BillingWebhookEventThreeDataMeter HooksMessages = new(
        Values.HooksMessages
    );

    public BillingWebhookEventThreeDataMeter(string value)
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
    public static BillingWebhookEventThreeDataMeter FromCustom(string value)
    {
        return new BillingWebhookEventThreeDataMeter(value);
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

    public static bool operator ==(BillingWebhookEventThreeDataMeter value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(BillingWebhookEventThreeDataMeter value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(BillingWebhookEventThreeDataMeter value) => value.Value;

    public static explicit operator BillingWebhookEventThreeDataMeter(string value) => new(value);

    internal class BillingWebhookEventThreeDataMeterSerializer
        : JsonConverter<BillingWebhookEventThreeDataMeter>
    {
        public override BillingWebhookEventThreeDataMeter Read(
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
            return new BillingWebhookEventThreeDataMeter(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            BillingWebhookEventThreeDataMeter value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override BillingWebhookEventThreeDataMeter ReadAsPropertyName(
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
            return new BillingWebhookEventThreeDataMeter(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            BillingWebhookEventThreeDataMeter value,
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
        public const string EmailRecipients = "email.recipients";

        public const string EmailDedicatedIp = "email.dedicated_ip";

        public const string EmailAttachmentData = "email.attachment_data";

        public const string EmailReceived = "email.received";

        public const string EmailReceivedData = "email.received_data";

        public const string EmailInboxes = "email.inboxes";

        public const string SmsSegments = "sms.segments";

        public const string SmsReceivedSegments = "sms.received_segments";

        public const string SmsNumbers = "sms.numbers";

        public const string SmsRegistrations = "sms.registrations";

        public const string SignCompletedRequests = "sign.completed_requests";

        public const string RiskPhoneChecks = "risk.phone_checks";

        public const string RiskAssessments = "risk.assessments";

        public const string RiskContentChecks = "risk.content_checks";

        public const string VerifyVerifications = "verify.verifications";

        public const string VerifySms = "verify.sms";

        public const string FormsSubmissions = "forms.submissions";

        public const string FormsFileUploads = "forms.file_uploads";

        public const string SchedulingBookings = "scheduling.bookings";

        public const string SchedulingHosts = "scheduling.hosts";

        public const string HooksMessages = "hooks.messages";
    }
}
