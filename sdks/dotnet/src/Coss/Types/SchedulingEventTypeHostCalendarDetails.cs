using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingEventTypeHostCalendarDetails.SchedulingEventTypeHostCalendarDetailsSerializer)
)]
[Serializable]
public readonly record struct SchedulingEventTypeHostCalendarDetails : IStringEnum
{
    public static readonly SchedulingEventTypeHostCalendarDetails Neutral = new(Values.Neutral);

    public static readonly SchedulingEventTypeHostCalendarDetails Full = new(Values.Full);

    public SchedulingEventTypeHostCalendarDetails(string value)
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
    public static SchedulingEventTypeHostCalendarDetails FromCustom(string value)
    {
        return new SchedulingEventTypeHostCalendarDetails(value);
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

    public static bool operator ==(SchedulingEventTypeHostCalendarDetails value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingEventTypeHostCalendarDetails value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingEventTypeHostCalendarDetails value) =>
        value.Value;

    public static explicit operator SchedulingEventTypeHostCalendarDetails(string value) =>
        new(value);

    internal class SchedulingEventTypeHostCalendarDetailsSerializer
        : JsonConverter<SchedulingEventTypeHostCalendarDetails>
    {
        public override SchedulingEventTypeHostCalendarDetails Read(
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
            return new SchedulingEventTypeHostCalendarDetails(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingEventTypeHostCalendarDetails value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingEventTypeHostCalendarDetails ReadAsPropertyName(
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
            return new SchedulingEventTypeHostCalendarDetails(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingEventTypeHostCalendarDetails value,
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
        public const string Neutral = "neutral";

        public const string Full = "full";
    }
}
