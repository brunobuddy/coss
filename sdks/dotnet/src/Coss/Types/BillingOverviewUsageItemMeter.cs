using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(BillingOverviewUsageItemMeter.BillingOverviewUsageItemMeterSerializer))]
[Serializable]
public readonly record struct BillingOverviewUsageItemMeter : IStringEnum
{
    public static readonly BillingOverviewUsageItemMeter EmailRecipients = new(
        Values.EmailRecipients
    );

    public static readonly BillingOverviewUsageItemMeter EmailDedicatedIp = new(
        Values.EmailDedicatedIp
    );

    public static readonly BillingOverviewUsageItemMeter EmailAttachmentData = new(
        Values.EmailAttachmentData
    );

    public static readonly BillingOverviewUsageItemMeter EmailReceived = new(Values.EmailReceived);

    public static readonly BillingOverviewUsageItemMeter EmailReceivedData = new(
        Values.EmailReceivedData
    );

    public static readonly BillingOverviewUsageItemMeter EmailInboxes = new(Values.EmailInboxes);

    public static readonly BillingOverviewUsageItemMeter SmsSegments = new(Values.SmsSegments);

    public static readonly BillingOverviewUsageItemMeter SmsReceivedSegments = new(
        Values.SmsReceivedSegments
    );

    public static readonly BillingOverviewUsageItemMeter SmsNumbers = new(Values.SmsNumbers);

    public static readonly BillingOverviewUsageItemMeter SmsRegistrations = new(
        Values.SmsRegistrations
    );

    public static readonly BillingOverviewUsageItemMeter SignCompletedRequests = new(
        Values.SignCompletedRequests
    );

    public static readonly BillingOverviewUsageItemMeter RiskPhoneChecks = new(
        Values.RiskPhoneChecks
    );

    public static readonly BillingOverviewUsageItemMeter RiskAssessments = new(
        Values.RiskAssessments
    );

    public static readonly BillingOverviewUsageItemMeter RiskContentChecks = new(
        Values.RiskContentChecks
    );

    public static readonly BillingOverviewUsageItemMeter VerifyVerifications = new(
        Values.VerifyVerifications
    );

    public static readonly BillingOverviewUsageItemMeter VerifySms = new(Values.VerifySms);

    public static readonly BillingOverviewUsageItemMeter FormsSubmissions = new(
        Values.FormsSubmissions
    );

    public static readonly BillingOverviewUsageItemMeter FormsFileUploads = new(
        Values.FormsFileUploads
    );

    public static readonly BillingOverviewUsageItemMeter SchedulingBookings = new(
        Values.SchedulingBookings
    );

    public static readonly BillingOverviewUsageItemMeter SchedulingHosts = new(
        Values.SchedulingHosts
    );

    public static readonly BillingOverviewUsageItemMeter HooksMessages = new(Values.HooksMessages);

    public BillingOverviewUsageItemMeter(string value)
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
    public static BillingOverviewUsageItemMeter FromCustom(string value)
    {
        return new BillingOverviewUsageItemMeter(value);
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

    public static bool operator ==(BillingOverviewUsageItemMeter value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(BillingOverviewUsageItemMeter value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(BillingOverviewUsageItemMeter value) => value.Value;

    public static explicit operator BillingOverviewUsageItemMeter(string value) => new(value);

    internal class BillingOverviewUsageItemMeterSerializer
        : JsonConverter<BillingOverviewUsageItemMeter>
    {
        public override BillingOverviewUsageItemMeter Read(
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
            return new BillingOverviewUsageItemMeter(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            BillingOverviewUsageItemMeter value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override BillingOverviewUsageItemMeter ReadAsPropertyName(
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
            return new BillingOverviewUsageItemMeter(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            BillingOverviewUsageItemMeter value,
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
