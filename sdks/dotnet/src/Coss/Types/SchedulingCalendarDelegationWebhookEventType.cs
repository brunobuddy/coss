using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingCalendarDelegationWebhookEventType.SchedulingCalendarDelegationWebhookEventTypeSerializer)
)]
[Serializable]
public readonly record struct SchedulingCalendarDelegationWebhookEventType : IStringEnum
{
    public static readonly SchedulingCalendarDelegationWebhookEventType SchedulingCalendarDelegationFailing =
        new(Values.SchedulingCalendarDelegationFailing);

    public static readonly SchedulingCalendarDelegationWebhookEventType SchedulingCalendarDelegationRestored =
        new(Values.SchedulingCalendarDelegationRestored);

    public SchedulingCalendarDelegationWebhookEventType(string value)
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
    public static SchedulingCalendarDelegationWebhookEventType FromCustom(string value)
    {
        return new SchedulingCalendarDelegationWebhookEventType(value);
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
        SchedulingCalendarDelegationWebhookEventType value1,
        string value2
    ) => value1.Value.Equals(value2);

    public static bool operator !=(
        SchedulingCalendarDelegationWebhookEventType value1,
        string value2
    ) => !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingCalendarDelegationWebhookEventType value) =>
        value.Value;

    public static explicit operator SchedulingCalendarDelegationWebhookEventType(string value) =>
        new(value);

    internal class SchedulingCalendarDelegationWebhookEventTypeSerializer
        : JsonConverter<SchedulingCalendarDelegationWebhookEventType>
    {
        public override SchedulingCalendarDelegationWebhookEventType Read(
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
            return new SchedulingCalendarDelegationWebhookEventType(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingCalendarDelegationWebhookEventType value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingCalendarDelegationWebhookEventType ReadAsPropertyName(
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
            return new SchedulingCalendarDelegationWebhookEventType(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingCalendarDelegationWebhookEventType value,
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
        public const string SchedulingCalendarDelegationFailing =
            "scheduling.calendar_delegation.failing";

        public const string SchedulingCalendarDelegationRestored =
            "scheduling.calendar_delegation.restored";
    }
}
