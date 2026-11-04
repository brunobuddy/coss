using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingCalendarWebhookEventType.SchedulingCalendarWebhookEventTypeSerializer)
)]
[Serializable]
public readonly record struct SchedulingCalendarWebhookEventType : IStringEnum
{
    public static readonly SchedulingCalendarWebhookEventType SchedulingCalendarConnected = new(
        Values.SchedulingCalendarConnected
    );

    public static readonly SchedulingCalendarWebhookEventType SchedulingCalendarNeedsReauth = new(
        Values.SchedulingCalendarNeedsReauth
    );

    public static readonly SchedulingCalendarWebhookEventType SchedulingCalendarDisconnected = new(
        Values.SchedulingCalendarDisconnected
    );

    public SchedulingCalendarWebhookEventType(string value)
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
    public static SchedulingCalendarWebhookEventType FromCustom(string value)
    {
        return new SchedulingCalendarWebhookEventType(value);
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

    public static bool operator ==(SchedulingCalendarWebhookEventType value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingCalendarWebhookEventType value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingCalendarWebhookEventType value) => value.Value;

    public static explicit operator SchedulingCalendarWebhookEventType(string value) => new(value);

    internal class SchedulingCalendarWebhookEventTypeSerializer
        : JsonConverter<SchedulingCalendarWebhookEventType>
    {
        public override SchedulingCalendarWebhookEventType Read(
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
            return new SchedulingCalendarWebhookEventType(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingCalendarWebhookEventType value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingCalendarWebhookEventType ReadAsPropertyName(
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
            return new SchedulingCalendarWebhookEventType(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingCalendarWebhookEventType value,
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
        public const string SchedulingCalendarConnected = "scheduling.calendar.connected";

        public const string SchedulingCalendarNeedsReauth = "scheduling.calendar.needs_reauth";

        public const string SchedulingCalendarDisconnected = "scheduling.calendar.disconnected";
    }
}
