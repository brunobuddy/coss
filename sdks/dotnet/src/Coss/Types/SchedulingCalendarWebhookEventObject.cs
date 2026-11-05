using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingCalendarWebhookEventObject.SchedulingCalendarWebhookEventObjectSerializer)
)]
[Serializable]
public readonly record struct SchedulingCalendarWebhookEventObject : IStringEnum
{
    public static readonly SchedulingCalendarWebhookEventObject Event = new(Values.Event);

    public SchedulingCalendarWebhookEventObject(string value)
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
    public static SchedulingCalendarWebhookEventObject FromCustom(string value)
    {
        return new SchedulingCalendarWebhookEventObject(value);
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

    public static bool operator ==(SchedulingCalendarWebhookEventObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingCalendarWebhookEventObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingCalendarWebhookEventObject value) =>
        value.Value;

    public static explicit operator SchedulingCalendarWebhookEventObject(string value) =>
        new(value);

    internal class SchedulingCalendarWebhookEventObjectSerializer
        : JsonConverter<SchedulingCalendarWebhookEventObject>
    {
        public override SchedulingCalendarWebhookEventObject Read(
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
            return new SchedulingCalendarWebhookEventObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingCalendarWebhookEventObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingCalendarWebhookEventObject ReadAsPropertyName(
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
            return new SchedulingCalendarWebhookEventObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingCalendarWebhookEventObject value,
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
        public const string Event = "event";
    }
}
