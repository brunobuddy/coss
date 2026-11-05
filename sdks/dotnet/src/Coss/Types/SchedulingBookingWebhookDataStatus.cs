using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingBookingWebhookDataStatus.SchedulingBookingWebhookDataStatusSerializer)
)]
[Serializable]
public readonly record struct SchedulingBookingWebhookDataStatus : IStringEnum
{
    public static readonly SchedulingBookingWebhookDataStatus Held = new(Values.Held);

    public static readonly SchedulingBookingWebhookDataStatus PendingApproval = new(
        Values.PendingApproval
    );

    public static readonly SchedulingBookingWebhookDataStatus Confirmed = new(Values.Confirmed);

    public static readonly SchedulingBookingWebhookDataStatus Cancelled = new(Values.Cancelled);

    public static readonly SchedulingBookingWebhookDataStatus Declined = new(Values.Declined);

    public SchedulingBookingWebhookDataStatus(string value)
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
    public static SchedulingBookingWebhookDataStatus FromCustom(string value)
    {
        return new SchedulingBookingWebhookDataStatus(value);
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

    public static bool operator ==(SchedulingBookingWebhookDataStatus value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingWebhookDataStatus value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingWebhookDataStatus value) => value.Value;

    public static explicit operator SchedulingBookingWebhookDataStatus(string value) => new(value);

    internal class SchedulingBookingWebhookDataStatusSerializer
        : JsonConverter<SchedulingBookingWebhookDataStatus>
    {
        public override SchedulingBookingWebhookDataStatus Read(
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
            return new SchedulingBookingWebhookDataStatus(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingWebhookDataStatus value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingWebhookDataStatus ReadAsPropertyName(
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
            return new SchedulingBookingWebhookDataStatus(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingWebhookDataStatus value,
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
        public const string Held = "held";

        public const string PendingApproval = "pending_approval";

        public const string Confirmed = "confirmed";

        public const string Cancelled = "cancelled";

        public const string Declined = "declined";
    }
}
