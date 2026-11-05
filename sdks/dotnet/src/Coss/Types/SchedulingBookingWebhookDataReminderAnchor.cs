using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingBookingWebhookDataReminderAnchor.SchedulingBookingWebhookDataReminderAnchorSerializer)
)]
[Serializable]
public readonly record struct SchedulingBookingWebhookDataReminderAnchor : IStringEnum
{
    public static readonly SchedulingBookingWebhookDataReminderAnchor Start = new(Values.Start);

    public static readonly SchedulingBookingWebhookDataReminderAnchor End = new(Values.End);

    public static readonly SchedulingBookingWebhookDataReminderAnchor Confirmed = new(
        Values.Confirmed
    );

    public static readonly SchedulingBookingWebhookDataReminderAnchor Rescheduled = new(
        Values.Rescheduled
    );

    public static readonly SchedulingBookingWebhookDataReminderAnchor Cancelled = new(
        Values.Cancelled
    );

    public static readonly SchedulingBookingWebhookDataReminderAnchor Declined = new(
        Values.Declined
    );

    public static readonly SchedulingBookingWebhookDataReminderAnchor PendingApproval = new(
        Values.PendingApproval
    );

    public static readonly SchedulingBookingWebhookDataReminderAnchor NoShow = new(Values.NoShow);

    public SchedulingBookingWebhookDataReminderAnchor(string value)
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
    public static SchedulingBookingWebhookDataReminderAnchor FromCustom(string value)
    {
        return new SchedulingBookingWebhookDataReminderAnchor(value);
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
        SchedulingBookingWebhookDataReminderAnchor value1,
        string value2
    ) => value1.Value.Equals(value2);

    public static bool operator !=(
        SchedulingBookingWebhookDataReminderAnchor value1,
        string value2
    ) => !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingWebhookDataReminderAnchor value) =>
        value.Value;

    public static explicit operator SchedulingBookingWebhookDataReminderAnchor(string value) =>
        new(value);

    internal class SchedulingBookingWebhookDataReminderAnchorSerializer
        : JsonConverter<SchedulingBookingWebhookDataReminderAnchor>
    {
        public override SchedulingBookingWebhookDataReminderAnchor Read(
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
            return new SchedulingBookingWebhookDataReminderAnchor(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingWebhookDataReminderAnchor value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingWebhookDataReminderAnchor ReadAsPropertyName(
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
            return new SchedulingBookingWebhookDataReminderAnchor(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingWebhookDataReminderAnchor value,
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
        public const string Start = "start";

        public const string End = "end";

        public const string Confirmed = "confirmed";

        public const string Rescheduled = "rescheduled";

        public const string Cancelled = "cancelled";

        public const string Declined = "declined";

        public const string PendingApproval = "pending_approval";

        public const string NoShow = "no_show";
    }
}
