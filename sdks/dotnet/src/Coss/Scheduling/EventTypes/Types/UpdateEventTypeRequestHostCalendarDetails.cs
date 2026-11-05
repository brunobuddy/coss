using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[JsonConverter(
    typeof(UpdateEventTypeRequestHostCalendarDetails.UpdateEventTypeRequestHostCalendarDetailsSerializer)
)]
[Serializable]
public readonly record struct UpdateEventTypeRequestHostCalendarDetails : IStringEnum
{
    public static readonly UpdateEventTypeRequestHostCalendarDetails Neutral = new(Values.Neutral);

    public static readonly UpdateEventTypeRequestHostCalendarDetails Full = new(Values.Full);

    public UpdateEventTypeRequestHostCalendarDetails(string value)
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
    public static UpdateEventTypeRequestHostCalendarDetails FromCustom(string value)
    {
        return new UpdateEventTypeRequestHostCalendarDetails(value);
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
        UpdateEventTypeRequestHostCalendarDetails value1,
        string value2
    ) => value1.Value.Equals(value2);

    public static bool operator !=(
        UpdateEventTypeRequestHostCalendarDetails value1,
        string value2
    ) => !value1.Value.Equals(value2);

    public static explicit operator string(UpdateEventTypeRequestHostCalendarDetails value) =>
        value.Value;

    public static explicit operator UpdateEventTypeRequestHostCalendarDetails(string value) =>
        new(value);

    internal class UpdateEventTypeRequestHostCalendarDetailsSerializer
        : JsonConverter<UpdateEventTypeRequestHostCalendarDetails>
    {
        public override UpdateEventTypeRequestHostCalendarDetails Read(
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
            return new UpdateEventTypeRequestHostCalendarDetails(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            UpdateEventTypeRequestHostCalendarDetails value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override UpdateEventTypeRequestHostCalendarDetails ReadAsPropertyName(
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
            return new UpdateEventTypeRequestHostCalendarDetails(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            UpdateEventTypeRequestHostCalendarDetails value,
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
